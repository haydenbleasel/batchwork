import {
  buildEmbeddingBodies,
  buildImageBodies,
  buildRequestBodies,
} from "./body";
import { BatchworkError } from "./errors";
import { BatchJob } from "./job";
import { resolveBatchLimits } from "./limits";
import {
  EMBEDDING_PROVIDERS,
  IMAGE_PROVIDERS,
  resolveModel,
  unsupportedEmbeddingProvider,
  unsupportedImageProvider,
} from "./model";
import { getAdapter } from "./providers";
import type {
  BatchEmbeddingsOptions,
  BatchImageOptions,
  BatchOptions,
  BatchProvider,
  BatchRef,
  BatchResult,
  ProviderCredentials,
} from "./types";

const EMPTY_REQUESTS_MESSAGE = "batchwork: `requests` must not be empty.";

const pickCredentials = (source: ProviderCredentials): ProviderCredentials => ({
  apiKey: source.apiKey,
  baseURL: source.baseURL,
  headers: source.headers,
});

const providerFromRef = (ref: BatchRef): BatchProvider => {
  if (ref.provider) {
    return ref.provider;
  }
  if (ref.model !== undefined) {
    return resolveModel(ref.model).provider;
  }
  throw new BatchworkError(
    "batchwork: provide `provider` or `model` to identify the batch."
  );
};

/**
 * Submit a batch of text/chat requests to the model's provider and return a
 * handle. Reachable as both `batch()` (shorthand) and `batch.text()`.
 *
 * Resolves immediately once the batch is accepted — it does not wait for
 * processing. Use the returned {@link BatchJob} to poll, wait, or stream
 * results.
 *
 * @example
 * const job = await batch({
 *   model: openai("gpt-5.5"),
 *   requests: [{ customId: "a", prompt: "Say hi" }],
 * });
 * const results = await job.wait().then(() => job.collect());
 */
const submitText = async (options: BatchOptions): Promise<BatchJob> => {
  if (options.requests.length === 0) {
    throw new BatchworkError(EMPTY_REQUESTS_MESSAGE);
  }

  const resolved = resolveModel(options.model);
  const credentials = pickCredentials(options);
  const limits = resolveBatchLimits(options.limits);
  const adapter = getAdapter(resolved.provider);

  const built = await buildRequestBodies(
    resolved,
    options.requests,
    options.defaults,
    credentials,
    limits
  );
  const snapshot = await adapter.submit({
    built,
    credentials,
    endpoint: built[0]?.endpoint ?? "",
    limits,
    metadata: options.metadata,
    modelId: resolved.modelId,
  });

  return new BatchJob(adapter, credentials, snapshot);
};

/**
 * Submit a batch of embedding requests to the model's provider and return a
 * handle. Each request's `value` produces one vector, correlated by `customId`
 * via {@link BatchJob.results}. Supported for OpenAI, Mistral, Together, and
 * Google; other providers throw {@link UnsupportedProviderError}.
 *
 * @example
 * const job = await batch.embeddings({
 *   model: openai.embeddingModel("text-embedding-3-small"),
 *   requests: [{ customId: "a", value: "hello world" }],
 * });
 * const results = await job.wait().then(() => job.collect());
 * for (const r of results) {
 *   console.log(r.customId, r.embedding?.length);
 * }
 */
const submitEmbeddings = async (
  options: BatchEmbeddingsOptions
): Promise<BatchJob> => {
  if (options.requests.length === 0) {
    throw new BatchworkError(EMPTY_REQUESTS_MESSAGE);
  }

  const resolved = resolveModel(options.model);
  if (!EMBEDDING_PROVIDERS.has(resolved.provider)) {
    throw unsupportedEmbeddingProvider(resolved.provider);
  }
  const credentials = pickCredentials(options);
  const limits = resolveBatchLimits(options.limits);
  const adapter = getAdapter(resolved.provider);

  const built = await buildEmbeddingBodies(
    resolved,
    options.requests,
    credentials,
    limits
  );
  const snapshot = await adapter.submit({
    built,
    credentials,
    endpoint: built[0]?.endpoint ?? "",
    limits,
    metadata: options.metadata,
    modelId: resolved.modelId,
  });

  return new BatchJob(adapter, credentials, snapshot);
};

/**
 * Submit a batch of image-generation requests to the model's provider and
 * return a handle. Each request's `prompt` produces one or more images,
 * correlated by `customId` via {@link BatchJob.results}. Supported for OpenAI
 * and Google; other providers throw {@link UnsupportedProviderError}.
 *
 * @example
 * const job = await batch.images({
 *   model: openai.image("gpt-image-2"),
 *   requests: [{ customId: "a", prompt: "a red bicycle" }],
 * });
 * const results = await job.wait().then(() => job.collect());
 * for (const r of results) {
 *   console.log(r.customId, r.images?.length);
 * }
 */
const submitImages = async (options: BatchImageOptions): Promise<BatchJob> => {
  if (options.requests.length === 0) {
    throw new BatchworkError(EMPTY_REQUESTS_MESSAGE);
  }

  const resolved = resolveModel(options.model);
  if (!IMAGE_PROVIDERS.has(resolved.provider)) {
    throw unsupportedImageProvider(resolved.provider);
  }
  const credentials = pickCredentials(options);
  const limits = resolveBatchLimits(options.limits);
  const adapter = getAdapter(resolved.provider);

  const built = await buildImageBodies(
    resolved,
    options.requests,
    options.defaults,
    credentials,
    limits
  );
  const snapshot = await adapter.submit({
    built,
    credentials,
    endpoint: built[0]?.endpoint ?? "",
    limits,
    metadata: options.metadata,
    modelId: resolved.modelId,
  });

  return new BatchJob(adapter, credentials, snapshot);
};

/**
 * Submit a batch of requests and return a {@link BatchJob} handle.
 *
 * Callable directly as a shorthand for text/chat batches, with one method per
 * modality:
 *
 * - `batch()` / {@link batch.text} — text & chat completions
 * - {@link batch.embeddings} — embedding vectors
 * - {@link batch.images} — image generation
 *
 * @example
 * const job = await batch({
 *   model: openai("gpt-5.5"),
 *   requests: [{ customId: "a", prompt: "Say hi" }],
 * });
 */
export const batch = Object.assign(submitText, {
  /** Submit a batch of embedding requests. */
  embeddings: submitEmbeddings,
  /** Submit a batch of image-generation requests. */
  images: submitImages,
  /** Submit a batch of text/chat requests. Equivalent to calling `batch()`. */
  text: submitText,
});

/**
 * @deprecated Use {@link batch.embeddings} instead. Kept as a standalone alias
 * for backward compatibility; it will be removed in a future major.
 */
export const batchEmbeddings = submitEmbeddings;

/**
 * @deprecated Use {@link batch.images} instead. Kept as a standalone alias for
 * backward compatibility; it will be removed in a future major.
 */
export const batchImages = submitImages;

/**
 * Rehydrate a {@link BatchJob} for an existing batch id (e.g. one persisted
 * after submission). Identify the provider with `provider` or `model`.
 */
export const getBatch = async (ref: BatchRef): Promise<BatchJob> => {
  const adapter = getAdapter(providerFromRef(ref));
  const credentials = pickCredentials(ref);
  const snapshot = await adapter.retrieve(ref.id, credentials);
  return new BatchJob(adapter, credentials, snapshot);
};

/** Stream the results of an existing batch by id, without a handle. */
export const getBatchResults = (ref: BatchRef): AsyncGenerator<BatchResult> => {
  const adapter = getAdapter(providerFromRef(ref));
  return adapter.results(ref.id, pickCredentials(ref));
};

/** Request cancellation of an existing batch by id. */
export const cancelBatch = async (ref: BatchRef): Promise<void> => {
  const adapter = getAdapter(providerFromRef(ref));
  await adapter.cancel(ref.id, pickCredentials(ref));
};
