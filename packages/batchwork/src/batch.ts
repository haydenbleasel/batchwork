import { buildRequestBodies } from "./body";
import { BatchworkError } from "./errors";
import { BatchJob } from "./job";
import { resolveModel } from "./model";
import { getAdapter } from "./providers";
import type {
  BatchOptions,
  BatchRef,
  BatchResult,
  ProviderCredentials,
} from "./types";

const pickCredentials = (source: ProviderCredentials): ProviderCredentials => ({
  apiKey: source.apiKey,
  baseURL: source.baseURL,
  headers: source.headers,
});

/**
 * Submit a batch of requests to the model's provider and return a handle.
 *
 * Resolves immediately once the batch is accepted — it does not wait for
 * processing. Use the returned {@link BatchJob} to poll, wait, or stream
 * results.
 *
 * @example
 * const job = await batch({
 *   model: openai("gpt-4o-mini"),
 *   requests: [{ customId: "a", prompt: "Say hi" }],
 * });
 * const results = await job.wait().then(() => job.collect());
 */
export const batch = async (options: BatchOptions): Promise<BatchJob> => {
  if (options.requests.length === 0) {
    throw new BatchworkError("batchwork: `requests` must not be empty.");
  }

  const resolved = resolveModel(options.model);
  const credentials = pickCredentials(options);
  const adapter = getAdapter(resolved.provider);

  const built = await buildRequestBodies(
    resolved,
    options.requests,
    options.defaults,
    credentials
  );
  const snapshot = await adapter.submit({
    built,
    credentials,
    endpoint: built[0]?.endpoint ?? "",
    metadata: options.metadata,
  });

  return new BatchJob(adapter, credentials, snapshot);
};

/**
 * Rehydrate a {@link BatchJob} for an existing batch id (e.g. one persisted
 * after submission). The `model` only needs to identify the provider.
 */
export const getBatch = async (ref: BatchRef): Promise<BatchJob> => {
  const resolved = resolveModel(ref.model);
  const adapter = getAdapter(resolved.provider);
  const credentials = pickCredentials(ref);
  const snapshot = await adapter.retrieve(ref.id, credentials);
  return new BatchJob(adapter, credentials, snapshot);
};

/** Stream the results of an existing batch by id, without a handle. */
export const getBatchResults = (ref: BatchRef): AsyncGenerator<BatchResult> => {
  const resolved = resolveModel(ref.model);
  const adapter = getAdapter(resolved.provider);
  return adapter.results(ref.id, pickCredentials(ref));
};

/** Request cancellation of an existing batch by id. */
export const cancelBatch = async (ref: BatchRef): Promise<void> => {
  const resolved = resolveModel(ref.model);
  const adapter = getAdapter(resolved.provider);
  await adapter.cancel(ref.id, pickCredentials(ref));
};
