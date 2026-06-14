import { describe, expect, it } from "bun:test";

import type { LanguageModel } from "ai";

import { UnsupportedProviderError } from "../src/errors";
import { resolveModel } from "../src/model";
import type { BatchProvider } from "../src/types";

/** A minimal stand-in for an AI SDK model object. */
const model = (provider: string, modelId: string): LanguageModel =>
  ({ modelId, provider }) as unknown as LanguageModel;

describe("resolveModel", () => {
  it("resolves provider/model strings", () => {
    const cases: [string, BatchProvider][] = [
      ["openai/gpt-4o-mini", "openai"],
      ["anthropic/claude-3-5-sonnet", "anthropic"],
      ["groq/llama-3.3-70b", "groq"],
      ["mistral/mistral-small-latest", "mistral"],
      ["google/gemini-2.5-flash", "google"],
      ["gemini/gemini-2.5-flash", "google"],
      ["xai/grok-4", "xai"],
      ["together/meta-llama", "together"],
      ["togetherai/meta-llama", "together"],
    ];
    for (const [value, provider] of cases) {
      expect(resolveModel(value).provider).toBe(provider);
    }
  });

  it("resolves AI SDK model objects by provider prefix", () => {
    expect(resolveModel(model("groq.chat", "llama")).provider).toBe("groq");
    expect(resolveModel(model("mistral.chat", "m")).provider).toBe("mistral");
    expect(resolveModel(model("google.generative-ai", "g")).provider).toBe(
      "google"
    );
    expect(resolveModel(model("xai.chat", "grok")).provider).toBe("xai");
    expect(resolveModel(model("togetherai.chat", "t")).provider).toBe(
      "together"
    );
  });

  it("preserves OpenAI request kinds", () => {
    expect(resolveModel(model("openai.responses", "gpt-4o")).kind).toBe(
      "responses"
    );
    expect(resolveModel(model("openai.completion", "gpt-3.5")).kind).toBe(
      "completion"
    );
    expect(resolveModel(model("openai.chat", "gpt-4o")).kind).toBe("chat");
    // Non-OpenAI providers always resolve to the chat shape.
    expect(resolveModel(model("groq.chat", "llama")).kind).toBe("chat");
  });

  it("unwraps gateway/registry models carrying provider/model in the id", () => {
    expect(resolveModel(model("gateway", "openai/gpt-4o")).provider).toBe(
      "openai"
    );
    expect(resolveModel(model("gateway", "mistral/m")).provider).toBe(
      "mistral"
    );
  });

  it("throws for unsupported providers", () => {
    expect(() => resolveModel("cohere/command-r")).toThrow(
      UnsupportedProviderError
    );
    expect(() => resolveModel("openai")).toThrow(UnsupportedProviderError);
  });
});
