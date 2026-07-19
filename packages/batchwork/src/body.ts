import {
  embed,
  experimental_generateVideo,
  generateImage,
  generateText,
} from "ai";
import type { EmbeddingModel, ImageModel, LanguageModel } from "ai";

import { BatchworkError } from "./errors";
import {
  assertByteLength,
  mapWithConcurrency,
  resolveBatchLimits,
} from "./limits";
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
  BatchVideoDefaults,
  BatchVideoRequest,
  ProviderCredentials,
  VideoModel,
} from "./types";

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

// `CapturingFetch` is `typeof fetch`, whose shape varies by runtime types (e.g.
// Bun adds a required `preconnect` method). We only ever call it as a plain
// fetch, so cast the bare implementation rather than stub the extra members.
const captureFetch = ((input: string | URL | Request, init?: RequestInit) =>
  Promise.reject(
    new CaptureSignalError(resolveUrl(input), extractBody(init))
  )) as unknown as CapturingFetch;

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

/**
 * Turn a thrown capture into a {@link BuiltRequest}. A genuine failure (one that
 * never reached the capturing `fetch`, e.g. an invalid prompt) is rethrown.
 */
const bodyFromCapture = (
  error: unknown,
  customId: string,
  maxRequestBytes: number
): BuiltRequest => {
  const capture = findCapture(error);
  if (capture) {
    assertByteLength(`request "${customId}"`, capture.rawBody, maxRequestBytes);
    return {
      body: JSON.parse(capture.rawBody) as Record<string, unknown>,
      customId,
      endpoint: endpointFromUrl(capture.url),
    };
  }
  throw error;
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
    return bodyFromCapture(error, customId, maxRequestBytes);
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
    return bodyFromCapture(error, customId, maxRequestBytes);
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
    return bodyFromCapture(error, customId, maxRequestBytes);
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

  return await mapWithConcurrency(
    items,
    limits.captureConcurrency,
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
    }
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

  return await mapWithConcurrency(
    items,
    limits.captureConcurrency,
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
    }
  );
};

const MODERATION_ENDPOINT = "/v1/moderations";

/**
 * Build the moderation `input`: a bare string for text, or the OpenAI omni
 * moderation content-part array when images are involved.
 */
const moderationInput = (request: BatchModerationRequest): unknown => {
  const imageUrls = request.imageUrls ?? [];
  if (imageUrls.length === 0) {
    return request.value;
  }
  return [
    ...(request.value === undefined
      ? []
      : [{ text: request.value, type: "text" }]),
    ...imageUrls.map((url) => ({ image_url: { url }, type: "image_url" })),
  ];
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
): Record<string, unknown> => {
  if (request.value === undefined && !request.imageUrls?.length) {
    throw new BatchworkError(
      `batchwork: moderation request "${customId}" needs \`value\` or \`imageUrls\`.`
    );
  }
  const options = request.providerOptions?.[resolved.provider];
  if (resolved.provider === "openai") {
    return {
      input: moderationInput(request),
      model: resolved.modelId,
      ...options,
    };
  }
  if (resolved.provider === "mistral") {
    if (request.imageUrls?.length) {
      throw new BatchworkError(
        `batchwork: moderation request "${customId}" has \`imageUrls\`, but Mistral moderation is text-only.`
      );
    }
    // `model` is included for uniformity; the Mistral adapter strips it from
    // each line and sets it on the job instead.
    return { input: request.value, model: resolved.modelId, ...options };
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
const transcriptionBody = (
  resolved: ResolvedModel,
  request: BatchTranscriptionRequest
): Record<string, unknown> => {
  const options = request.providerOptions?.[resolved.provider];
  if (resolved.provider === "groq") {
    return {
      model: resolved.modelId,
      url: request.audioUrl,
      ...(request.language ? { language: request.language } : {}),
      // Timestamps require the verbose response shape; providerOptions can
      // still override `response_format` since it spreads last.
      ...(request.timestampGranularities
        ? {
            response_format: "verbose_json",
            timestamp_granularities: request.timestampGranularities,
          }
        : {}),
      ...options,
    };
  }
  if (resolved.provider === "mistral") {
    // `model` is included for uniformity; the Mistral adapter strips it from
    // each line and sets it on the job instead.
    return {
      file_url: request.audioUrl,
      model: resolved.modelId,
      ...(request.language ? { language: request.language } : {}),
      ...(request.timestampGranularities
        ? { timestamp_granularities: request.timestampGranularities }
        : {}),
      ...options,
    };
  }
  if (resolved.provider === "together") {
    // Together's audio batch lines carry the hosted URL in `file`; extra
    // fields pass through to the underlying transcription API.
    return {
      file: request.audioUrl,
      model: resolved.modelId,
      ...(request.language ? { language: request.language } : {}),
      ...(request.timestampGranularities
        ? {
            response_format: "verbose_json",
            timestamp_granularities: request.timestampGranularities,
          }
        : {}),
      ...options,
    };
  }
  throw unsupportedTranscriptionProvider(resolved.provider);
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
    return { body, customId: item.customId, endpoint: TRANSCRIPTION_ENDPOINT };
  });
};

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

  return await mapWithConcurrency(
    items,
    limits.captureConcurrency,
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
    }
  );
};

const IMAGE_EDIT_ENDPOINT = "/v1/images/edits";

const openaiImageRef = (ref: BatchImageRef): Record<string, string> =>
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
): Record<string, unknown> => {
  if (request.images.length === 0) {
    throw new BatchworkError(
      `batchwork: image-edit request "${customId}" needs at least one entry in \`images\`.`
    );
  }
  const options = request.providerOptions?.[resolved.provider];
  if (resolved.provider === "openai") {
    return {
      images: request.images.map(openaiImageRef),
      model: resolved.modelId,
      prompt: request.prompt,
      ...(request.mask ? { mask: openaiImageRef(request.mask) } : {}),
      ...(request.n === undefined ? {} : { n: request.n }),
      ...(request.size ? { size: request.size } : {}),
      ...options,
    };
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
    return {
      model: resolved.modelId,
      prompt: request.prompt,
      ...(urls.length === 1
        ? { image: { url: urls[0] } }
        : { images: urls.map((url) => ({ url })) }),
      ...(request.n === undefined ? {} : { n: request.n }),
      ...options,
    };
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
    return bodyFromCapture(error, customId, maxRequestBytes);
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

  return await mapWithConcurrency(
    items,
    limits.captureConcurrency,
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
    }
  );
};
