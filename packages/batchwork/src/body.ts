import {
  embed,
  experimental_generateVideo,
  generateImage,
  generateText,
} from "ai";
import type { EmbeddingModel, ImageModel, LanguageModel } from "ai";
import pMap from "p-map";

import { BatchworkError } from "./errors";
import { isString } from "./guards";
import { assertByteLength, resolveBatchLimits } from "./limits";
import type { ResolvedBatchLimits } from "./limits";
import {
  createCaptureEmbeddingModel,
  createCaptureImageModel,
  createCaptureModel,
  createCaptureVideoModel,
  unsupportedImageEditProvider,
  unsupportedModerationProvider,
  unsupportedTranscriptionProvider,
} from "./model";
import type { CapturingFetch, ResolvedModel } from "./model";
import type {
  BatchDefaults,
  BatchEmbeddingRequest,
  BatchImageDefaults,
  BatchImageEditDefaults,
  BatchImageEditRequest,
  BatchImageRef,
  BatchImageRequest,
  BatchLimits,
  BatchModerationRequest,
  BatchRequest,
  BatchTranscriptionDefaults,
  BatchTranscriptionRequest,
  BatchTranslationDefaults,
  BatchTranslationRequest,
  BatchVideoDefaults,
  BatchVideoRequest,
  JsonObject,
  JsonValue,
  ProviderCredentials,
  VideoModel,
} from "./types";
import { isJsonObject, parseJson } from "./util";

type GenerateTextInput = Parameters<typeof generateText>[0];

/** A provider request body derived from a single batch item. */
export interface BuiltRequest {
  /** The serialized provider request body (becomes the batch line). */
  body: JsonObject;
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
  if (input instanceof URL) {
    return input.toString();
  }
  if (input instanceof Request) {
    return input.url;
  }
  return input;
};

const extractBody = (init?: RequestInit): string => {
  const body = init?.body;
  if (isString(body)) {
    return body;
  }
  if (body instanceof Uint8Array) {
    return new TextDecoder().decode(body);
  }
  throw new BatchworkError(
    "batchwork: unable to read the provider request body during capture."
  );
};

// `CapturingFetch` is `typeof fetch`, whose declaration varies by runtime
// types: Bun's adds a `preconnect` member. Capture only ever calls it as a
// plain fetch, so a no-op `preconnect` keeps the bare implementation
// assignable under both sets of types.
const captureFetch: CapturingFetch = Object.assign(
  (input: string | URL | Request, init?: RequestInit) =>
    Promise.reject(
      new CaptureSignalError(resolveUrl(input), extractBody(init))
    ),
  {
    preconnect: () => {
      // Never called during capture.
    },
  }
);

/** Whether a thrown value carries an Error-style `cause`. */
const hasCause = (value: unknown): value is { cause: unknown } =>
  typeof value === "object" && value !== null && "cause" in value;

/**
 * Walk a thrown value's `cause` chain (starting at the value itself) looking
 * for the capture signal, giving up after `MAX_CAUSE_DEPTH` links.
 */
const findCapture = (
  cause: unknown,
  depth = 0
): CaptureSignalError | undefined => {
  if (depth >= MAX_CAUSE_DEPTH) {
    return;
  }
  if (cause instanceof CaptureSignalError) {
    return cause;
  }
  return hasCause(cause) ? findCapture(cause.cause, depth + 1) : undefined;
};

const endpointFromUrl = (url: string): string => {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
};

const mergeDefaults = <Request extends object>(
  request: Request,
  defaults: NoInfer<Partial<Request>> | undefined
): Request => {
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
  // SAFETY: `prompt`/`messages` form a discriminated union in the AI SDK
  // types; both keys are passed and `generateText` validates the XOR at
  // runtime, so the object always satisfies one branch.
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

/** Turn a capture signal into a {@link BuiltRequest}. */
const bodyFromCapture = (
  capture: CaptureSignalError,
  customId: string,
  maxRequestBytes: number
): BuiltRequest => {
  assertByteLength(`request "${customId}"`, capture.rawBody, maxRequestBytes);
  const body = parseJson(capture.rawBody);
  if (!isJsonObject(body)) {
    throw new BatchworkError(
      `batchwork: the captured body for request "${customId}" is not a JSON object.`
    );
  }
  return { body, customId, endpoint: endpointFromUrl(capture.url) };
};

const captureOne = async (
  model: LanguageModel,
  request: BatchRequest,
  customId: string,
  maxRequestBytes: number
): Promise<BuiltRequest> => {
  try {
    await generateText(toGenerateInput(model, request));
  } catch (error) {
    // A genuine failure (one that never reached the capturing `fetch`, e.g. an
    // invalid prompt) carries no capture signal and is rethrown.
    const capture = findCapture(error);
    if (!capture) {
      throw error;
    }
    return bodyFromCapture(capture, customId, maxRequestBytes);
  }
  throw new BatchworkError(
    "batchwork: the request was not intercepted while building the batch body."
  );
};

const captureEmbeddingOne = async (
  model: EmbeddingModel,
  request: BatchEmbeddingRequest,
  customId: string,
  maxRequestBytes: number
): Promise<BuiltRequest> => {
  try {
    // `maxRetries: 0` is load-bearing: with retries enabled the capture error
    // is wrapped in a `RetryError` (under `.errors`, not `.cause`) and
    // `findCapture`'s cause walk would miss it.
    await embed({
      maxRetries: 0,
      model,
      providerOptions: request.providerOptions,
      value: request.value,
    });
  } catch (error) {
    // A genuine failure (one that never reached the capturing `fetch`, e.g. an
    // invalid prompt) carries no capture signal and is rethrown.
    const capture = findCapture(error);
    if (!capture) {
      throw error;
    }
    return bodyFromCapture(capture, customId, maxRequestBytes);
  }
  throw new BatchworkError(
    "batchwork: the request was not intercepted while building the embedding body."
  );
};

const captureImageOne = async (
  model: ImageModel,
  request: BatchImageRequest,
  customId: string,
  maxRequestBytes: number
): Promise<BuiltRequest> => {
  try {
    await generateImage({
      aspectRatio: request.aspectRatio,
      // `maxImagesPerCall: n` forces a single `doGenerate` call so the captured
      // body carries the requested `n` rather than a fanned-out per-call count.
      maxImagesPerCall: request.n,
      // `maxRetries: 0` is load-bearing: with retries enabled the capture error
      // is wrapped in a `RetryError` (under `.errors`, not `.cause`) and
      // `findCapture`'s cause walk would miss it.
      maxRetries: 0,
      model,
      n: request.n,
      prompt: request.prompt,
      providerOptions: request.providerOptions,
      seed: request.seed,
      size: request.size,
    });
  } catch (error) {
    // A genuine failure (one that never reached the capturing `fetch`, e.g. an
    // invalid prompt) carries no capture signal and is rethrown.
    const capture = findCapture(error);
    if (!capture) {
      throw error;
    }
    return bodyFromCapture(capture, customId, maxRequestBytes);
  }
  throw new BatchworkError(
    "batchwork: the request was not intercepted while building the image body."
  );
};

/**
 * Assign and validate a unique `customId` for each request (sequentially, so
 * duplicates are reported deterministically before bodies are captured in
 * parallel). Auto-generates `request-{index}` when omitted.
 */
const assignCustomIds = <T extends { customId?: string }>(
  requests: readonly T[]
): { customId: string; request: T }[] => {
  const seen = new Set<string>();
  return requests.map((request, index) => {
    const customId = request.customId ?? `request-${index}`;
    if (seen.has(customId)) {
      throw new BatchworkError(
        `batchwork: duplicate customId "${customId}". customId values must be unique within a batch.`
      );
    }
    seen.add(customId);
    return { customId, request };
  });
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
  credentials: ProviderCredentials,
  rawLimits?: BatchLimits | ResolvedBatchLimits
): Promise<BuiltRequest[]> => {
  const limits = resolveBatchLimits(rawLimits);
  if (requests.length > limits.maxRequests) {
    throw new BatchworkError(
      `batchwork: requests length ${requests.length} exceeds the ${limits.maxRequests} request limit.`
    );
  }
  const model = await createCaptureModel(resolved, credentials, captureFetch);
  const items = assignCustomIds(requests);

  return await pMap(
    items,
    async (item) => {
      const built = await captureOne(
        model,
        mergeDefaults(item.request, defaults),
        item.customId,
        limits.maxRequestBytes
      );
      assertByteLength(
        `request "${item.customId}"`,
        JSON.stringify(built.body),
        limits.maxRequestBytes
      );
      return built;
    },
    { concurrency: limits.captureConcurrency }
  );
};

/**
 * Derive provider embedding request bodies for every batch item by running each
 * through the AI SDK `embed` with a capturing `fetch`. Mirrors
 * {@link buildRequestBodies} for the embedding endpoint; each item maps to a
 * single embedding (`input: [value]`), correlated by `customId`.
 */
export const buildEmbeddingBodies = async (
  resolved: ResolvedModel,
  requests: readonly BatchEmbeddingRequest[],
  credentials: ProviderCredentials,
  rawLimits?: BatchLimits | ResolvedBatchLimits
): Promise<BuiltRequest[]> => {
  const limits = resolveBatchLimits(rawLimits);
  if (requests.length > limits.maxRequests) {
    throw new BatchworkError(
      `batchwork: requests length ${requests.length} exceeds the ${limits.maxRequests} request limit.`
    );
  }
  const model = await createCaptureEmbeddingModel(
    resolved,
    credentials,
    captureFetch
  );
  const items = assignCustomIds(requests);

  return await pMap(
    items,
    async (item) => {
      const built = await captureEmbeddingOne(
        model,
        item.request,
        item.customId,
        limits.maxRequestBytes
      );
      assertByteLength(
        `request "${item.customId}"`,
        JSON.stringify(built.body),
        limits.maxRequestBytes
      );
      return built;
    },
    { concurrency: limits.captureConcurrency }
  );
};

const MODERATION_ENDPOINT = "/v1/moderations";

/**
 * Build the OpenAI omni moderation content-part array for a request that
 * involves images: an optional text part followed by one part per image URL.
 */
const moderationParts = (
  value: string | undefined,
  imageUrls: readonly string[]
): JsonValue[] => {
  const parts: JsonValue[] = [];
  if (value !== undefined) {
    parts.push({ text: value, type: "text" });
  }
  for (const url of imageUrls) {
    parts.push({ image_url: { url }, type: "image_url" });
  }
  return parts;
};

/**
 * Build the provider moderation body directly — the AI SDK has no moderation
 * call to capture. Both providers take `{ input }`; OpenAI carries the model
 * per line, Mistral on the job.
 */
const moderationBody = (
  resolved: ResolvedModel,
  request: BatchModerationRequest,
  customId: string
): JsonObject => {
  const { value } = request;
  const imageUrls = request.imageUrls ?? [];
  if (value === undefined && imageUrls.length === 0) {
    throw new BatchworkError(
      `batchwork: moderation request "${customId}" needs \`value\` or \`imageUrls\`.`
    );
  }
  const options = request.providerOptions?.[resolved.provider];
  if (resolved.provider === "openai") {
    // A text-only request sends the bare string; images switch to the
    // content-part array.
    const input =
      imageUrls.length === 0 && value !== undefined
        ? value
        : moderationParts(value, imageUrls);
    return { input, model: resolved.modelId, ...options };
  }
  if (resolved.provider === "mistral") {
    if (imageUrls.length > 0) {
      throw new BatchworkError(
        `batchwork: moderation request "${customId}" has \`imageUrls\`, but Mistral moderation is text-only.`
      );
    }
    // `model` is included for uniformity; the Mistral adapter strips it from
    // each line and sets it on the job instead.
    return { input: value ?? "", model: resolved.modelId, ...options };
  }
  throw unsupportedModerationProvider(resolved.provider);
};

/**
 * Build provider moderation request bodies for every batch item. Each item
 * maps to a single moderation verdict, correlated by `customId`.
 */
export const buildModerationBodies = (
  resolved: ResolvedModel,
  requests: readonly BatchModerationRequest[],
  rawLimits?: BatchLimits | ResolvedBatchLimits
): BuiltRequest[] => {
  const limits = resolveBatchLimits(rawLimits);
  if (requests.length > limits.maxRequests) {
    throw new BatchworkError(
      `batchwork: requests length ${requests.length} exceeds the ${limits.maxRequests} request limit.`
    );
  }
  return assignCustomIds(requests).map((item) => {
    const body = moderationBody(resolved, item.request, item.customId);
    assertByteLength(
      `request "${item.customId}"`,
      JSON.stringify(body),
      limits.maxRequestBytes
    );
    return { body, customId: item.customId, endpoint: MODERATION_ENDPOINT };
  });
};

const TRANSCRIPTION_ENDPOINT = "/v1/audio/transcriptions";

/**
 * Build the provider transcription body directly. Batch audio endpoints take
 * JSON with a hosted audio URL — unlike the synchronous transcription APIs
 * (and the AI SDK's `transcribe`), which upload the file as multipart form
 * data — so there is no SDK call to capture.
 */
/**
 * The optional audio fields shared by every provider's line: `language`, and
 * the timestamp granularities (which, where the provider needs it, also
 * require the verbose response shape). `providerOptions` spreads after these,
 * so it can still override `response_format`.
 */
const audioOptions = (
  request: BatchTranscriptionRequest,
  verboseTimestamps: boolean
): JsonObject => {
  const fields: JsonObject = {};
  if (request.language) {
    fields.language = request.language;
  }
  if (request.timestampGranularities) {
    if (verboseTimestamps) {
      fields.response_format = "verbose_json";
    }
    fields.timestamp_granularities = request.timestampGranularities;
  }
  return fields;
};

const transcriptionBody = (
  resolved: ResolvedModel,
  request: BatchTranscriptionRequest
): JsonObject => {
  const options = request.providerOptions?.[resolved.provider];
  if (resolved.provider === "groq") {
    return {
      model: resolved.modelId,
      url: request.audioUrl,
      ...audioOptions(request, true),
      ...options,
    };
  }
  if (resolved.provider === "mistral") {
    // `model` is included for uniformity; the Mistral adapter strips it from
    // each line and sets it on the job instead.
    return {
      file_url: request.audioUrl,
      model: resolved.modelId,
      ...audioOptions(request, false),
      ...options,
    };
  }
  if (resolved.provider === "together") {
    // Together's audio batch lines carry the hosted URL in `file`; extra
    // fields pass through to the underlying transcription API.
    return {
      file: request.audioUrl,
      model: resolved.modelId,
      ...audioOptions(request, true),
      ...options,
    };
  }
  throw unsupportedTranscriptionProvider(resolved.provider);
};

const buildAudioBodies = (
  resolved: ResolvedModel,
  requests: readonly BatchTranscriptionRequest[],
  defaults: BatchTranscriptionDefaults | undefined,
  endpoint: string,
  rawLimits?: BatchLimits | ResolvedBatchLimits
): BuiltRequest[] => {
  const limits = resolveBatchLimits(rawLimits);
  if (requests.length > limits.maxRequests) {
    throw new BatchworkError(
      `batchwork: requests length ${requests.length} exceeds the ${limits.maxRequests} request limit.`
    );
  }
  return assignCustomIds(requests).map((item) => {
    const body = transcriptionBody(
      resolved,
      mergeDefaults(item.request, defaults)
    );
    assertByteLength(
      `request "${item.customId}"`,
      JSON.stringify(body),
      limits.maxRequestBytes
    );
    return { body, customId: item.customId, endpoint };
  });
};

/**
 * Build provider transcription request bodies for every batch item. Each item
 * maps to a single transcription of a hosted audio URL, correlated by
 * `customId`.
 */
export const buildTranscriptionBodies = (
  resolved: ResolvedModel,
  requests: readonly BatchTranscriptionRequest[],
  defaults: BatchTranscriptionDefaults | undefined,
  rawLimits?: BatchLimits | ResolvedBatchLimits
): BuiltRequest[] =>
  buildAudioBodies(
    resolved,
    requests,
    defaults,
    TRANSCRIPTION_ENDPOINT,
    rawLimits
  );

/**
 * Build provider audio-translation request bodies for every batch item. The
 * body shape is identical to transcription (minus `language` — the output is
 * always English); only the endpoint differs.
 */
export const buildTranslationBodies = (
  resolved: ResolvedModel,
  requests: readonly BatchTranslationRequest[],
  defaults: BatchTranslationDefaults | undefined,
  rawLimits?: BatchLimits | ResolvedBatchLimits
): BuiltRequest[] =>
  buildAudioBodies(
    resolved,
    requests,
    defaults,
    "/v1/audio/translations",
    rawLimits
  );

/**
 * Derive provider image-generation request bodies for every batch item by
 * running each through the AI SDK `generateImage` with a capturing `fetch`.
 * Mirrors {@link buildRequestBodies} for the image endpoint; each item maps to a
 * single image-generation call, correlated by `customId`.
 */
export const buildImageBodies = async (
  resolved: ResolvedModel,
  requests: readonly BatchImageRequest[],
  defaults: BatchImageDefaults | undefined,
  credentials: ProviderCredentials,
  rawLimits?: BatchLimits | ResolvedBatchLimits
): Promise<BuiltRequest[]> => {
  const limits = resolveBatchLimits(rawLimits);
  if (requests.length > limits.maxRequests) {
    throw new BatchworkError(
      `batchwork: requests length ${requests.length} exceeds the ${limits.maxRequests} request limit.`
    );
  }
  const model = await createCaptureImageModel(
    resolved,
    credentials,
    captureFetch
  );
  const items = assignCustomIds(requests);

  return await pMap(
    items,
    async (item) => {
      const built = await captureImageOne(
        model,
        mergeDefaults(item.request, defaults),
        item.customId,
        limits.maxRequestBytes
      );
      assertByteLength(
        `request "${item.customId}"`,
        JSON.stringify(built.body),
        limits.maxRequestBytes
      );
      return built;
    },
    { concurrency: limits.captureConcurrency }
  );
};

const IMAGE_EDIT_ENDPOINT = "/v1/images/edits";

const openaiImageRef = (ref: BatchImageRef): JsonObject =>
  "fileId" in ref ? { file_id: ref.fileId } : { image_url: ref.imageUrl };

/**
 * Build the provider image-edit body directly — the AI SDK's `generateImage`
 * has no way to pass input images, so there is no call to capture. Both
 * providers take JSON with asset references: OpenAI `{ images: [{ file_id |
 * image_url }], mask? }`, xAI `{ image: { url } }` (URLs only, no masks).
 */
const imageEditBody = (
  resolved: ResolvedModel,
  request: BatchImageEditRequest,
  customId: string
): JsonObject => {
  if (request.images.length === 0) {
    throw new BatchworkError(
      `batchwork: image-edit request "${customId}" needs at least one entry in \`images\`.`
    );
  }
  const options = request.providerOptions?.[resolved.provider];
  if (resolved.provider === "openai") {
    const body: JsonObject = {
      images: request.images.map(openaiImageRef),
      model: resolved.modelId,
      prompt: request.prompt,
    };
    if (request.mask) {
      body.mask = openaiImageRef(request.mask);
    }
    if (request.n !== undefined) {
      body.n = request.n;
    }
    if (request.size) {
      body.size = request.size;
    }
    return { ...body, ...options };
  }
  if (resolved.provider === "xai") {
    if (request.mask) {
      throw new BatchworkError(
        `batchwork: image-edit request "${customId}" has a \`mask\`, but xAI image edits do not support masks.`
      );
    }
    if (request.size) {
      throw new BatchworkError(
        `batchwork: image-edit request "${customId}" has \`size\`, but xAI image edits take \`providerOptions.xai.aspect_ratio\` instead.`
      );
    }
    const urls = request.images.map((ref) => {
      if ("fileId" in ref) {
        throw new BatchworkError(
          `batchwork: image-edit request "${customId}" uses a \`fileId\` reference, but xAI image edits accept image URLs only.`
        );
      }
      return ref.imageUrl;
    });
    const body: JsonObject = {
      model: resolved.modelId,
      prompt: request.prompt,
      ...(urls.length === 1
        ? { image: { url: urls[0] } }
        : { images: urls.map((url) => ({ url })) }),
    };
    if (request.n !== undefined) {
      body.n = request.n;
    }
    return { ...body, ...options };
  }
  throw unsupportedImageEditProvider(resolved.provider);
};

/**
 * Build provider image-edit request bodies for every batch item. Each item
 * maps to a single edit call, correlated by `customId`.
 */
export const buildImageEditBodies = (
  resolved: ResolvedModel,
  requests: readonly BatchImageEditRequest[],
  defaults: BatchImageEditDefaults | undefined,
  rawLimits?: BatchLimits | ResolvedBatchLimits
): BuiltRequest[] => {
  const limits = resolveBatchLimits(rawLimits);
  if (requests.length > limits.maxRequests) {
    throw new BatchworkError(
      `batchwork: requests length ${requests.length} exceeds the ${limits.maxRequests} request limit.`
    );
  }
  return assignCustomIds(requests).map((item) => {
    const body = imageEditBody(
      resolved,
      mergeDefaults(item.request, defaults),
      item.customId
    );
    assertByteLength(
      `request "${item.customId}"`,
      JSON.stringify(body),
      limits.maxRequestBytes
    );
    return { body, customId: item.customId, endpoint: IMAGE_EDIT_ENDPOINT };
  });
};

const captureVideoOne = async (
  model: VideoModel,
  request: BatchVideoRequest,
  customId: string,
  maxRequestBytes: number
): Promise<BuiltRequest> => {
  try {
    // The provider's first network call is the JSON job-creation POST (polling
    // only starts afterwards), so the capturing `fetch` intercepts the exact
    // body a batch line needs. Edit/extend modes (via `providerOptions`) are
    // captured against their own endpoints, which xAI batch also accepts.
    await experimental_generateVideo({
      aspectRatio: request.aspectRatio,
      duration: request.duration,
      // `maxRetries: 0` is load-bearing: with retries enabled the capture error
      // is wrapped in a `RetryError` (under `.errors`, not `.cause`) and
      // `findCapture`'s cause walk would miss it.
      maxRetries: 0,
      model,
      prompt: request.prompt,
      providerOptions: request.providerOptions,
      resolution: request.resolution,
    });
  } catch (error) {
    // A genuine failure (one that never reached the capturing `fetch`, e.g. an
    // invalid prompt) carries no capture signal and is rethrown.
    const capture = findCapture(error);
    if (!capture) {
      throw error;
    }
    return bodyFromCapture(capture, customId, maxRequestBytes);
  }
  throw new BatchworkError(
    "batchwork: the request was not intercepted while building the video body."
  );
};

/**
 * Derive provider video-generation request bodies for every batch item by
 * running each through the AI SDK `generateVideo` with a capturing `fetch`.
 * Mirrors {@link buildRequestBodies} for the video endpoints; each item maps to
 * a single video job, correlated by `customId`.
 */
export const buildVideoBodies = async (
  resolved: ResolvedModel,
  requests: readonly BatchVideoRequest[],
  defaults: BatchVideoDefaults | undefined,
  credentials: ProviderCredentials,
  rawLimits?: BatchLimits | ResolvedBatchLimits
): Promise<BuiltRequest[]> => {
  const limits = resolveBatchLimits(rawLimits);
  if (requests.length > limits.maxRequests) {
    throw new BatchworkError(
      `batchwork: requests length ${requests.length} exceeds the ${limits.maxRequests} request limit.`
    );
  }
  const model = await createCaptureVideoModel(
    resolved,
    credentials,
    captureFetch
  );
  const items = assignCustomIds(requests);

  return await pMap(
    items,
    async (item) => {
      const built = await captureVideoOne(
        model,
        mergeDefaults(item.request, defaults),
        item.customId,
        limits.maxRequestBytes
      );
      assertByteLength(
        `request "${item.customId}"`,
        JSON.stringify(built.body),
        limits.maxRequestBytes
      );
      return built;
    },
    { concurrency: limits.captureConcurrency }
  );
};
