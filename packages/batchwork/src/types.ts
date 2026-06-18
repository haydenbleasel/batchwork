import type {
  EmbeddingModel,
  JSONValue,
  LanguageModel,
  ModelMessage,
  ToolChoice,
  ToolSet,
} from "ai";

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
  /** Raw provider response body (OpenAI `response.body` / Anthropic message). */
  response?: unknown;
  status: BatchResultStatus;
  /** Normalized text output, when the request produced a message. */
  text?: string;
  usage?: BatchUsage;
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

/** Input to `batch()`. */
export interface BatchOptions extends ProviderCredentials {
  defaults?: BatchDefaults;
  limits?: BatchLimits;
  metadata?: Record<string, string>;
  model: LanguageModel;
  requests: BatchRequest[];
}

/** Input to `batchEmbeddings()`. */
export interface BatchEmbeddingsOptions extends ProviderCredentials {
  limits?: BatchLimits;
  metadata?: Record<string, string>;
  model: EmbeddingModel;
  requests: BatchEmbeddingRequest[];
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
