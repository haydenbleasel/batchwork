import type * as AnthropicModule from "@ai-sdk/anthropic";
import type * as OpenAIModule from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

import { MissingDependencyError, UnsupportedProviderError } from "./errors";
import type { BatchProvider, ProviderCredentials } from "./types";

/** A fetch implementation compatible with the AI SDK provider `fetch` option. */
export type CapturingFetch = typeof globalThis.fetch;

/** OpenAI exposes several request shapes; we mirror the one the model implies. */
export type OpenAIModelKind = "chat" | "responses" | "completion";

export interface ResolvedModel {
  /** Relevant for OpenAI; Anthropic always uses the Messages endpoint. */
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
  if (providerId === "openai") {
    return { kind: "chat", modelId, provider: "openai" };
  }
  if (providerId === "anthropic") {
    return { kind: "chat", modelId, provider: "anthropic" };
  }
  throw new UnsupportedProviderError(providerId);
};

/**
 * Resolve any AI SDK `model` (a `"provider/model"` string or a provider model
 * object such as `openai("gpt-4o-mini")`) to a provider + model id + request
 * shape. Gateway/registry model objects whose `modelId` is itself
 * `"provider/model"` are also handled.
 */
export const resolveModel = (model: LanguageModel): ResolvedModel => {
  if (typeof model === "string") {
    return resolveModelString(model);
  }

  const [family, suffix] = splitOnce(model.provider, ".");
  if (family === "openai") {
    return {
      kind: openaiKind(suffix),
      modelId: model.modelId,
      provider: "openai",
    };
  }
  if (family === "anthropic") {
    return { kind: "chat", modelId: model.modelId, provider: "anthropic" };
  }
  // Gateway/registry providers carry the real target in the model id.
  if (model.modelId.includes("/")) {
    return resolveModelString(model.modelId);
  }
  throw new UnsupportedProviderError(model.provider);
};

const loadOpenAI = async (): Promise<typeof OpenAIModule> => {
  try {
    return await import("@ai-sdk/openai");
  } catch {
    throw new MissingDependencyError("@ai-sdk/openai", "OpenAI");
  }
};

const loadAnthropic = async (): Promise<typeof AnthropicModule> => {
  try {
    return await import("@ai-sdk/anthropic");
  } catch {
    throw new MissingDependencyError("@ai-sdk/anthropic", "Anthropic");
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

  if (resolved.provider === "openai") {
    const { createOpenAI } = await loadOpenAI();
    const provider = createOpenAI(settings);
    if (resolved.kind === "responses") {
      return provider.responses(resolved.modelId);
    }
    if (resolved.kind === "completion") {
      return provider.completion(resolved.modelId);
    }
    return provider.chat(resolved.modelId);
  }

  const { createAnthropic } = await loadAnthropic();
  const provider = createAnthropic(settings);
  return provider.messages(resolved.modelId);
};
