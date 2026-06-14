import { generateText } from "ai";
import type { LanguageModel } from "ai";

import { BatchworkError } from "./errors";
import { createCaptureModel } from "./model";
import type { CapturingFetch, ResolvedModel } from "./model";
import type { BatchDefaults, BatchRequest, ProviderCredentials } from "./types";

type GenerateTextInput = Parameters<typeof generateText>[0];

/** A provider request body derived from a single batch item. */
export interface BuiltRequest {
  /** The serialized provider request body (becomes the batch line). */
  body: Record<string, unknown>;
  customId: string;
  /** API endpoint path the model targets, e.g. `/v1/chat/completions`. */
  endpoint: string;
}

const MAX_CAUSE_DEPTH = 10;

/**
 * Thrown by the capturing `fetch` to abort the request after its body has been
 * serialized. The body travels inside the error (not shared state), so capture
 * is correct even under concurrency.
 */
class CaptureSignalError extends Error {
  readonly url: string;
  readonly rawBody: string;

  constructor(url: string, rawBody: string) {
    super("batchwork:capture");
    this.name = "CaptureSignalError";
    this.url = url;
    this.rawBody = rawBody;
  }
}

const resolveUrl = (input: string | URL | Request): string => {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
};

const extractBody = (init?: RequestInit): string => {
  const body = init?.body;
  if (typeof body === "string") {
    return body;
  }
  if (body instanceof Uint8Array) {
    return new TextDecoder().decode(body);
  }
  throw new BatchworkError(
    "batchwork: unable to read the provider request body during capture."
  );
};

const captureFetch: CapturingFetch = (input, init) =>
  Promise.reject(new CaptureSignalError(resolveUrl(input), extractBody(init)));

const findCapture = (error: unknown): CaptureSignalError | undefined => {
  let current: unknown = error;
  let depth = 0;
  while (current && depth < MAX_CAUSE_DEPTH) {
    if (current instanceof CaptureSignalError) {
      return current;
    }
    current = (current as { cause?: unknown }).cause;
    depth += 1;
  }
};

const endpointFromUrl = (url: string): string => {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
};

const mergeDefaults = (
  request: BatchRequest,
  defaults: BatchDefaults | undefined
): BatchRequest => {
  if (!defaults) {
    return request;
  }
  return { ...defaults, ...request };
};

/**
 * Map a batch request to AI SDK `generateText` input. Fields are listed
 * explicitly so `customId` never leaks into the provider request.
 */
const toGenerateInput = (
  model: LanguageModel,
  request: BatchRequest
): GenerateTextInput =>
  // `prompt`/`messages` form a discriminated union in the AI SDK types; we
  // pass both keys and let `generateText` validate the XOR at runtime.
  ({
    frequencyPenalty: request.frequencyPenalty,
    maxOutputTokens: request.maxOutputTokens,
    maxRetries: 0,
    messages: request.messages,
    model,
    presencePenalty: request.presencePenalty,
    prompt: request.prompt,
    providerOptions: request.providerOptions,
    seed: request.seed,
    stopSequences: request.stopSequences,
    system: request.system,
    temperature: request.temperature,
    toolChoice: request.toolChoice,
    tools: request.tools,
    topK: request.topK,
    topP: request.topP,
  }) as GenerateTextInput;

const captureOne = async (
  model: LanguageModel,
  request: BatchRequest,
  customId: string
): Promise<BuiltRequest> => {
  try {
    await generateText(toGenerateInput(model, request));
  } catch (error) {
    const capture = findCapture(error);
    if (capture) {
      return {
        body: JSON.parse(capture.rawBody) as Record<string, unknown>,
        customId,
        endpoint: endpointFromUrl(capture.url),
      };
    }
    // A genuine failure (e.g. invalid prompt) — surface it to the caller.
    throw error;
  }
  throw new BatchworkError(
    "batchwork: the request was not intercepted while building the batch body."
  );
};

/**
 * Derive provider request bodies for every batch item by running each through
 * the AI SDK with a capturing `fetch`. This reuses the AI SDK's full message,
 * tool, and multimodal conversion, so the body matches what `generateText`
 * would send — minus the network call.
 */
export const buildRequestBodies = async (
  resolved: ResolvedModel,
  requests: readonly BatchRequest[],
  defaults: BatchDefaults | undefined,
  credentials: ProviderCredentials
): Promise<BuiltRequest[]> => {
  const model = await createCaptureModel(resolved, credentials, captureFetch);
  const seen = new Set<string>();

  // Assign and validate customIds up front (sequentially, so duplicates are
  // reported deterministically) before capturing bodies in parallel.
  const items = requests.map((request, index) => {
    const customId = request.customId ?? `request-${index}`;
    if (seen.has(customId)) {
      throw new BatchworkError(
        `batchwork: duplicate customId "${customId}". customId values must be unique within a batch.`
      );
    }
    seen.add(customId);
    return { customId, request };
  });

  return await Promise.all(
    items.map((item) =>
      captureOne(model, mergeDefaults(item.request, defaults), item.customId)
    )
  );
};
