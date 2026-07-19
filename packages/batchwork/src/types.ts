import type {
  EmbeddingModel,
  experimental_generateVideo,
  ImageModel,
  JSONValue,
  LanguageModel,
  ModelMessage,
  ToolChoice,
  ToolSet,
  TranscriptionModel,
} from "ai";

/**
 * The `model` argument of the AI SDK's `experimental_generateVideo` — a video
 * model object or a `"provider/model"` string. Derived from the function
 * signature because the AI SDK does not export a video model type yet.
 */
export type VideoModel = Parameters<
  typeof experimental_generateVideo
>[0]["model"];

/** Providers with a batch adapter. */
export type BatchProvider =
  | "anthropic"
  | "google"
  | "groq"
  | "mistral"
  | "openai"
  | "together"
  | "xai";

/**
 * Provider-specific options, forwarded verbatim into the underlying request
 * body. Structurally identical to the AI SDK's `ProviderOptions`.
 */
export type ProviderOptions = Record<string, Record<string, JSONValue>>;

/**
 * Sampling and prompt-shaping fields shared with the AI SDK's `generateText`.
 * Used both per request and as batch-wide defaults.
 */
export interface BatchRequestSettings {
  frequencyPenalty?: number;
  maxOutputTokens?: number;
  presencePenalty?: number;
  providerOptions?: ProviderOptions;
  seed?: number;
  stopSequences?: string[];
  system?: string;
  temperature?: number;
  toolChoice?: ToolChoice<ToolSet>;
  tools?: ToolSet;
  topK?: number;
  topP?: number;
}

/**
 * A single request within a batch. Mirrors the AI SDK `generateText` input
 * (minus `model`), plus a `customId` used to correlate the result.
 */
export interface BatchRequest extends BatchRequestSettings {
  /** Correlates this request to its result. Auto-generated when omitted. */
  customId?: string;
  messages?: ModelMessage[];
  prompt?: string;
}

/** Defaults merged into every request; request-level values take precedence. */
export type BatchDefaults = BatchRequestSettings;

/**
 * A single embedding request within a batch. One `value` produces one vector,
 * correlated to its result by `customId`. Per-request tuning (e.g. output
 * dimensions, task type) goes through `providerOptions`, mirroring the AI SDK
 * `embed` call — a top-level `dimensions` field would be dropped by the SDK.
 */
export interface BatchEmbeddingRequest {
  /** Correlates this request to its result. Auto-generated when omitted. */
  customId?: string;
  /** Forwarded to the provider embedding call (e.g. `{ openai: { dimensions } }`). */
  providerOptions?: ProviderOptions;
  /** The text to embed. */
  value: string;
}

/**
 * A generated image. Returned inline as base64 (`data` + `mediaType`) by most
 * providers, or as a hosted `url` by some (e.g. xAI batch, whose signed URLs
 * expire ~1h after completion — download promptly).
 */
export interface BatchImage {
  /** Base64-encoded image data (no `data:` prefix), when returned inline. */
  data?: string;
  /** MIME type, e.g. `"image/png"`, when known. */
  mediaType?: string;
  /** Hosted image URL, when returned instead of inline data. */
  url?: string;
}

/**
 * A single image-generation request within a batch. One `prompt` produces one
 * or more images, correlated to its result by `customId`. Generation only;
 * image editing (input images / masks) is not supported by batch APIs.
 */
export interface BatchImageRequest {
  /** Aspect ratio, `"{width}:{height}"` (e.g. Gemini image models). */
  aspectRatio?: `${number}:${number}`;
  /** Correlates this request to its result. Auto-generated when omitted. */
  customId?: string;
  /** Number of images to generate. Defaults to 1. */
  n?: number;
  /** The text prompt describing the image to generate. */
  prompt: string;
  /** Forwarded to the provider image call (e.g. `{ openai: { quality } }`). */
  providerOptions?: ProviderOptions;
  /** Seed for deterministic generation, where the provider supports it. */
  seed?: number;
  /** Image size, `"{width}x{height}"` (e.g. OpenAI image models). */
  size?: `${number}x${number}`;
}

/** Defaults merged into every image request; request-level values take precedence. */
export type BatchImageDefaults = Partial<
  Omit<BatchImageRequest, "customId" | "prompt">
>;

/**
 * A single audio-transcription request within a batch. Batch audio endpoints
 * accept hosted audio only (no file uploads): the provider fetches `audioUrl`
 * while processing, so the URL must stay reachable until the batch completes.
 */
export interface BatchTranscriptionRequest {
  /** Publicly reachable URL of the audio file to transcribe. */
  audioUrl: string;
  /** Correlates this request to its result. Auto-generated when omitted. */
  customId?: string;
  /** Language of the audio, as an ISO-639-1 code (e.g. `"en"`). */
  language?: string;
  /** Merged into the provider request body (e.g. `{ groq: { prompt } }`). */
  providerOptions?: ProviderOptions;
  /** Timestamp detail to request; populates `segments` on the result. */
  timestampGranularities?: ("segment" | "word")[];
}

/** Defaults merged into every transcription request; request-level values win. */
export type BatchTranscriptionDefaults = Partial<
  Omit<BatchTranscriptionRequest, "customId" | "audioUrl">
>;

/** A timestamped span of a transcript. */
export interface BatchTranscriptionSegment {
  endSecond?: number;
  startSecond?: number;
  text: string;
}

/**
 * A single video-generation request within a batch. One `prompt` produces one
 * video, correlated to its result by `customId`. Editing and extending an
 * existing video route through `providerOptions` (e.g. xAI's
 * `{ xai: { videoUrl } }` for edits, `{ xai: { mode: "extend-video", videoUrl } }`
 * to extend), mirroring the AI SDK's `generateVideo`.
 */
export interface BatchVideoRequest {
  /** Aspect ratio, `"{width}:{height}"` (e.g. `"16:9"`). */
  aspectRatio?: `${number}:${number}`;
  /** Correlates this request to its result. Auto-generated when omitted. */
  customId?: string;
  /** Clip length in seconds, where the model supports it. */
  duration?: number;
  /** The text prompt describing the video to generate. */
  prompt: string;
  /** Forwarded to the provider video call (e.g. `{ xai: { videoUrl } }`). */
  providerOptions?: ProviderOptions;
  /** Resolution, `"{width}x{height}"` (e.g. `"1280x720"`). */
  resolution?: `${number}x${number}`;
}

/** Defaults merged into every video request; request-level values take precedence. */
export type BatchVideoDefaults = Partial<
  Omit<BatchVideoRequest, "customId" | "prompt">
>;

/**
 * A generated video. Returned as a hosted `url` — xAI batch signs URLs that
 * expire ~1h after completion, so download promptly.
 */
export interface BatchVideo {
  /** Video length in seconds, when the provider reports it. */
  durationSeconds?: number;
  /** Hosted video URL. */
  url?: string;
}

/**
 * A single moderation request within a batch. Provide `value` (text),
 * `imageUrls` (OpenAI omni moderation only), or both; each request produces
 * one verdict, correlated by `customId`.
 */
export interface BatchModerationRequest {
  /** Correlates this request to its result. Auto-generated when omitted. */
  customId?: string;
  /**
   * Image URLs to moderate alongside (or instead of) `value`. Supported by
   * OpenAI omni moderation models only; Mistral moderation is text-only.
   */
  imageUrls?: string[];
  /** Merged into the provider request body. */
  providerOptions?: ProviderOptions;
  /** The text to moderate. */
  value?: string;
}

/**
 * A normalized moderation verdict. Category names are provider-native (e.g.
 * OpenAI `"hate/threatening"`, Mistral `"hate_and_discrimination"`).
 */
export interface BatchModeration {
  /** Per-category boolean flags. */
  categories: Record<string, boolean>;
  /** Per-category confidence scores. */
  categoryScores: Record<string, number>;
  /**
   * True when the input was flagged: the provider's own flag (OpenAI), or any
   * category flag when the provider reports none (Mistral).
   */
  flagged: boolean;
}

/** Normalized batch lifecycle status, unified across providers. */
export type BatchStatus =
  | "validating"
  | "in_progress"
  | "finalizing"
  | "completed"
  | "failed"
  | "expired"
  | "cancelling"
  | "cancelled";

/** Normalized per-request tallies. `completed` = succeeded, `failed` = errored. */
export interface BatchRequestCounts {
  canceled?: number;
  completed: number;
  expired?: number;
  failed: number;
  processing?: number;
  total: number;
}

/** Outcome of a single request within a batch. */
export type BatchResultStatus =
  | "succeeded"
  | "errored"
  | "expired"
  | "canceled";

export interface BatchUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface BatchResultError {
  code?: string | number;
  message: string;
  type?: string;
}

/** A normalized result line, correlated by `customId`. */
export interface BatchResult {
  customId: string;
  /** Normalized embedding vector, when the request produced an embedding. */
  embedding?: number[];
  /** Normalized error, present when `status` is `"errored"`. */
  error?: BatchResultError;
  /** Generated images, when the request produced images. */
  images?: BatchImage[];
  /** Normalized moderation verdict, when the request produced one. */
  moderation?: BatchModeration;
  /** Raw provider response body (OpenAI `response.body` / Anthropic message). */
  response?: unknown;
  /** Timestamped transcript segments, when requested via `timestampGranularities`. */
  segments?: BatchTranscriptionSegment[];
  status: BatchResultStatus;
  /** Normalized text output, when the request produced a message or transcript. */
  text?: string;
  usage?: BatchUsage;
  /** Generated videos, when the request produced videos. */
  videos?: BatchVideo[];
}

/** A point-in-time, normalized view of a batch's status. */
export interface BatchSnapshot {
  completedAt?: Date;
  createdAt?: Date;
  expiresAt?: Date;
  id: string;
  provider: BatchProvider;
  /** Raw provider status object. */
  raw: unknown;
  requestCounts: BatchRequestCounts;
  status: BatchStatus;
}

/** Provider credentials and connection config. Falls back to env when omitted. */
export interface ProviderCredentials {
  apiKey?: string;
  baseURL?: string;
  /** Extra provider-level HTTP headers (e.g. beta flags). */
  headers?: Record<string, string>;
}

export interface BatchLimits {
  captureConcurrency?: number;
  maxRequests?: number;
  maxRequestBytes?: number;
  maxUploadBytes?: number;
}

/** Input to `batch()` / `batch.text()`. */
export interface BatchOptions extends ProviderCredentials {
  defaults?: BatchDefaults;
  limits?: BatchLimits;
  metadata?: Record<string, string>;
  model: LanguageModel;
  requests: BatchRequest[];
}

/** Input to `batch.embeddings()`. */
export interface BatchEmbeddingsOptions extends ProviderCredentials {
  limits?: BatchLimits;
  metadata?: Record<string, string>;
  model: EmbeddingModel;
  requests: BatchEmbeddingRequest[];
}

/** Input to `batch.images()`. */
export interface BatchImageOptions extends ProviderCredentials {
  defaults?: BatchImageDefaults;
  limits?: BatchLimits;
  metadata?: Record<string, string>;
  model: ImageModel;
  requests: BatchImageRequest[];
}

/** Input to `batch.moderations()`. */
export interface BatchModerationOptions extends ProviderCredentials {
  limits?: BatchLimits;
  metadata?: Record<string, string>;
  /**
   * A `"provider/model"` string (e.g. `"openai/omni-moderation-latest"` or
   * `"mistral/mistral-moderation-latest"`) — the AI SDK has no moderation
   * model type.
   */
  model: string;
  requests: BatchModerationRequest[];
}

/** Input to `batch.videos()`. */
export interface BatchVideoOptions extends ProviderCredentials {
  defaults?: BatchVideoDefaults;
  limits?: BatchLimits;
  metadata?: Record<string, string>;
  /**
   * A video model object (e.g. `xai.video("grok-imagine-video")`) or a
   * `"provider/model"` string.
   */
  model: VideoModel;
  requests: BatchVideoRequest[];
}

/** Input to `batch.transcriptions()`. */
export interface BatchTranscriptionOptions extends ProviderCredentials {
  defaults?: BatchTranscriptionDefaults;
  limits?: BatchLimits;
  metadata?: Record<string, string>;
  /**
   * A transcription model object (e.g. `groq.transcription("whisper-large-v3")`)
   * or a `"provider/model"` string (e.g. `"mistral/voxtral-mini-latest"`).
   */
  model: TranscriptionModel;
  requests: BatchTranscriptionRequest[];
}

/**
 * Reference to an existing batch, used to rehydrate a handle. Identify the
 * provider with either `model` or `provider` (e.g. from a webhook event).
 */
export interface BatchRef extends ProviderCredentials {
  id: string;
  model?: LanguageModel;
  provider?: BatchProvider;
}

export interface WaitOptions {
  /** Invoked after every poll with the latest snapshot. */
  onPoll?: (snapshot: BatchSnapshot) => void;
  /** Delay between polls. Default 15000ms. */
  pollIntervalMs?: number;
  signal?: AbortSignal;
  /** Give up after this long. Default: no timeout. */
  timeoutMs?: number;
}
