import type * as AnthropicModule from "@ai-sdk/anthropic";
import type * as GoogleModule from "@ai-sdk/google";
import type * as GroqModule from "@ai-sdk/groq";
import type * as MistralModule from "@ai-sdk/mistral";
import type * as OpenAIModule from "@ai-sdk/openai";
import type * as TogetherModule from "@ai-sdk/togetherai";
import type * as XaiModule from "@ai-sdk/xai";
import type { EmbeddingModel, LanguageModel } from "ai";

import { MissingDependencyError, UnsupportedProviderError } from "./errors";
import type { BatchProvider, ProviderCredentials } from "./types";

/** A fetch implementation compatible with the AI SDK provider `fetch` option. */
export type CapturingFetch = typeof globalThis.fetch;

/** OpenAI exposes several request shapes; we mirror the one the model implies. */
export type OpenAIModelKind = "chat" | "responses" | "completion";

export interface ResolvedModel {
  /** Relevant for OpenAI; other providers always use a single chat endpoint. */
  kind: OpenAIModelKind;
  modelId: string;
  provider: BatchProvider;
}

/**
 * Placeholder API key used only when building request bodies. Body building
 * intercepts the request before it is sent, so no real credential is needed —
 * but the provider refuses to construct a model without one.
 */
const CAPTURE_API_KEY = "batchwork-capture";

/** The optional `@ai-sdk/*` package backing each provider. */
const PACKAGE_BY_PROVIDER: Record<
  BatchProvider,
  { label: string; specifier: string }
> = {
  anthropic: { label: "Anthropic", specifier: "@ai-sdk/anthropic" },
  google: { label: "Google Gemini", specifier: "@ai-sdk/google" },
  groq: { label: "Groq", specifier: "@ai-sdk/groq" },
  mistral: { label: "Mistral", specifier: "@ai-sdk/mistral" },
  openai: { label: "OpenAI", specifier: "@ai-sdk/openai" },
  together: { label: "Together AI", specifier: "@ai-sdk/togetherai" },
  xai: { label: "xAI", specifier: "@ai-sdk/xai" },
};

/**
 * AI SDK provider id prefixes (the part before the first `.` in `model.provider`)
 * mapped to batch providers.
 */
const PROVIDER_BY_FAMILY: Record<string, BatchProvider> = {
  anthropic: "anthropic",
  google: "google",
  groq: "groq",
  mistral: "mistral",
  openai: "openai",
  together: "together",
  togetherai: "together",
  xai: "xai",
};

/** Aliases accepted in the `"provider/model"` string form. */
const PROVIDER_BY_ALIAS: Record<string, BatchProvider> = {
  ...PROVIDER_BY_FAMILY,
  gemini: "google",
};

const splitOnce = (value: string, separator: string): [string, string] => {
  const index = value.indexOf(separator);
  if (index === -1) {
    return [value, ""];
  }
  return [value.slice(0, index), value.slice(index + separator.length)];
};

const openaiKind = (suffix: string): OpenAIModelKind => {
  if (suffix === "responses") {
    return "responses";
  }
  if (suffix === "completion") {
    return "completion";
  }
  // Default to chat completions: the most widely supported batch endpoint.
  return "chat";
};

/** Resolve a `"provider/model"` string into a provider + model id. */
const resolveModelString = (value: string): ResolvedModel => {
  const [providerId, modelId] = splitOnce(value, "/");
  if (modelId === "") {
    throw new UnsupportedProviderError(value);
  }
  const provider = PROVIDER_BY_ALIAS[providerId];
  if (!provider) {
    throw new UnsupportedProviderError(providerId);
  }
  return { kind: "chat", modelId, provider };
};

/**
 * Resolve any AI SDK `model` (a `"provider/model"` string or a provider model
 * object such as `openai("gpt-5.5")`) to a provider + model id + request
 * shape. Gateway/registry model objects whose `modelId` is itself
 * `"provider/model"` are also handled.
 */
export const resolveModel = (
  model: LanguageModel | EmbeddingModel
): ResolvedModel => {
  if (typeof model === "string") {
    return resolveModelString(model);
  }

  const [family, suffix] = splitOnce(model.provider, ".");
  const provider = PROVIDER_BY_FAMILY[family];
  if (provider === "openai") {
    return { kind: openaiKind(suffix), modelId: model.modelId, provider };
  }
  if (provider) {
    return { kind: "chat", modelId: model.modelId, provider };
  }
  // Gateway/registry providers carry the real target in the model id.
  if (model.modelId.includes("/")) {
    return resolveModelString(model.modelId);
  }
  throw new UnsupportedProviderError(model.provider);
};

const importProvider = (provider: BatchProvider): Promise<unknown> => {
  switch (provider) {
    case "anthropic": {
      return import("@ai-sdk/anthropic");
    }
    case "google": {
      return import("@ai-sdk/google");
    }
    case "groq": {
      return import("@ai-sdk/groq");
    }
    case "mistral": {
      return import("@ai-sdk/mistral");
    }
    case "openai": {
      return import("@ai-sdk/openai");
    }
    case "together": {
      return import("@ai-sdk/togetherai");
    }
    case "xai": {
      return import("@ai-sdk/xai");
    }
    default: {
      return Promise.reject(new UnsupportedProviderError(provider));
    }
  }
};

/**
 * Import the `@ai-sdk/*` package for a provider, translating a missing optional
 * dependency into a `MissingDependencyError`. The importer is injectable (like
 * the capturing `fetch`) so tests can drive the failure paths without
 * uninstalling a package. Exported for testing; not part of the public API.
 */
export const loadProvider = async <T>(
  provider: BatchProvider,
  load: (target: BatchProvider) => Promise<unknown> = importProvider
): Promise<T> => {
  try {
    return (await load(provider)) as T;
  } catch (error) {
    if (error instanceof UnsupportedProviderError) {
      throw error;
    }
    const { specifier, label } = PACKAGE_BY_PROVIDER[provider];
    throw new MissingDependencyError(specifier, label);
  }
};

/**
 * Construct an AI SDK model wired to a capturing `fetch`, used to derive the
 * provider request body for each batch item without making a network call.
 */
export const createCaptureModel = async (
  resolved: ResolvedModel,
  credentials: ProviderCredentials,
  fetchImpl: CapturingFetch
): Promise<LanguageModel> => {
  const settings = {
    apiKey: credentials.apiKey ?? CAPTURE_API_KEY,
    baseURL: credentials.baseURL,
    fetch: fetchImpl,
    headers: credentials.headers,
  };

  switch (resolved.provider) {
    case "openai": {
      const { createOpenAI } =
        await loadProvider<typeof OpenAIModule>("openai");
      const provider = createOpenAI(settings);
      if (resolved.kind === "responses") {
        return provider.responses(resolved.modelId);
      }
      if (resolved.kind === "completion") {
        return provider.completion(resolved.modelId);
      }
      return provider.chat(resolved.modelId);
    }
    case "anthropic": {
      const { createAnthropic } =
        await loadProvider<typeof AnthropicModule>("anthropic");
      return createAnthropic(settings).messages(resolved.modelId);
    }
    case "groq": {
      const { createGroq } = await loadProvider<typeof GroqModule>("groq");
      return createGroq(settings).languageModel(resolved.modelId);
    }
    case "mistral": {
      const { createMistral } =
        await loadProvider<typeof MistralModule>("mistral");
      return createMistral(settings).languageModel(resolved.modelId);
    }
    case "google": {
      const { createGoogleGenerativeAI } =
        await loadProvider<typeof GoogleModule>("google");
      return createGoogleGenerativeAI(settings).languageModel(resolved.modelId);
    }
    case "xai": {
      const { createXai } = await loadProvider<typeof XaiModule>("xai");
      return createXai(settings).languageModel(resolved.modelId);
    }
    case "together": {
      const { createTogetherAI } =
        await loadProvider<typeof TogetherModule>("together");
      return createTogetherAI(settings).languageModel(resolved.modelId);
    }
    default: {
      throw new UnsupportedProviderError(resolved.provider);
    }
  }
};

/**
 * Providers whose batch API accepts embeddings. Together is excluded: it exposes
 * an embedding model, but its batch endpoint rejects `/v1/embeddings`. Anthropic,
 * Groq, and xAI have no embedding model at all.
 */
export const EMBEDDING_PROVIDERS = new Set<BatchProvider>([
  "google",
  "mistral",
  "openai",
]);

export const unsupportedEmbeddingProvider = (
  provider: BatchProvider
): UnsupportedProviderError =>
  new UnsupportedProviderError(
    provider,
    `batchwork: provider "${provider}" does not offer batch embeddings. Embeddings are supported for: openai, mistral, google.`
  );

/**
 * Construct an AI SDK text embedding model wired to a capturing `fetch`, used to
 * derive the provider embedding request body for each batch item without making
 * a network call. Throws for providers without an embedding model.
 */
export const createCaptureEmbeddingModel = async (
  resolved: ResolvedModel,
  credentials: ProviderCredentials,
  fetchImpl: CapturingFetch
): Promise<EmbeddingModel> => {
  const settings = {
    apiKey: credentials.apiKey ?? CAPTURE_API_KEY,
    baseURL: credentials.baseURL,
    fetch: fetchImpl,
    headers: credentials.headers,
  };

  switch (resolved.provider) {
    case "openai": {
      const { createOpenAI } =
        await loadProvider<typeof OpenAIModule>("openai");
      return createOpenAI(settings).textEmbeddingModel(resolved.modelId);
    }
    case "mistral": {
      const { createMistral } =
        await loadProvider<typeof MistralModule>("mistral");
      return createMistral(settings).textEmbeddingModel(resolved.modelId);
    }
    case "google": {
      const { createGoogleGenerativeAI } =
        await loadProvider<typeof GoogleModule>("google");
      return createGoogleGenerativeAI(settings).textEmbeddingModel(
        resolved.modelId
      );
    }
    default: {
      throw unsupportedEmbeddingProvider(resolved.provider);
    }
  }
};
