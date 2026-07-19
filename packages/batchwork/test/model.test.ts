import { describe, expect, it } from "bun:test";

import type { LanguageModel } from "ai";

import {
  MissingDependencyError,
  UnsupportedProviderError,
} from "../src/errors";
import {
  createCaptureEmbeddingModel,
  createCaptureModel,
  loadProvider,
  resolveModel,
} from "../src/model";
import type { CapturingFetch, ResolvedModel } from "../src/model";
import type { BatchProvider } from "../src/types";

/** A minimal stand-in for an AI SDK model object. */
const model = (provider: string, modelId: string): LanguageModel =>
  ({ modelId, provider }) as unknown as LanguageModel;

const resolved = (
  provider: BatchProvider,
  kind: ResolvedModel["kind"] = "chat"
): ResolvedModel => ({ kind, modelId: "test-model", provider });

describe("resolveModel", () => {
  it("resolves provider/model strings", () => {
    const cases: [string, BatchProvider][] = [
      ["openai/gpt-4o-mini", "openai"],
      ["anthropic/claude-3-5-sonnet", "anthropic"],
      ["groq/llama-3.3-70b", "groq"],
      ["mistral/mistral-small-latest", "mistral"],
      ["google/gemini-3.5-flash", "google"],
      ["gemini/gemini-3.5-flash", "google"],
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

  it("throws for an unrecognized model object with no provider/model id", () => {
    expect(() => resolveModel(model("cohere", "command-r"))).toThrow(
      UnsupportedProviderError
    );
  });
});

describe("createCaptureModel", () => {
  // The capture fetch is never invoked here — we only construct the model.
  const fetchImpl = (() =>
    Promise.reject(new Error("unused"))) as unknown as CapturingFetch;

  it("constructs a model for every supported provider", async () => {
    const providers: BatchProvider[] = [
      "anthropic",
      "google",
      "groq",
      "mistral",
      "openai",
      "together",
      "xai",
    ];
    for (const provider of providers) {
      // oxlint-disable-next-line no-await-in-loop -- exercising each provider.
      const built = await createCaptureModel(
        resolved(provider),
        { apiKey: "k" },
        fetchImpl
      );
      expect(built).toBeDefined();
    }
  });

  it("constructs each OpenAI request shape", async () => {
    for (const kind of ["chat", "responses", "completion"] as const) {
      // oxlint-disable-next-line no-await-in-loop -- exercising each kind.
      const built = await createCaptureModel(
        resolved("openai", kind),
        {},
        fetchImpl
      );
      expect(built).toBeDefined();
    }
  });

  it("throws for an unsupported provider", async () => {
    await expect(
      createCaptureModel(resolved("cohere" as BatchProvider), {}, fetchImpl)
    ).rejects.toThrow(UnsupportedProviderError);
  });
});

describe("createCaptureEmbeddingModel", () => {
  const fetchImpl = (() =>
    Promise.reject(new Error("unused"))) as unknown as CapturingFetch;

  it("constructs a model for every embedding-capable provider", async () => {
    const providers: BatchProvider[] = ["google", "mistral", "openai"];
    for (const provider of providers) {
      // oxlint-disable-next-line no-await-in-loop -- exercising each provider.
      const built = await createCaptureEmbeddingModel(
        resolved(provider),
        { apiKey: "k" },
        fetchImpl
      );
      expect(built).toBeDefined();
    }
  });

  it("throws for providers without batch embeddings", async () => {
    const providers: BatchProvider[] = ["anthropic", "groq", "together", "xai"];
    for (const provider of providers) {
      // oxlint-disable-next-line no-await-in-loop -- exercising each provider.
      await expect(
        createCaptureEmbeddingModel(
          resolved(provider),
          { apiKey: "k" },
          fetchImpl
        )
      ).rejects.toThrow(UnsupportedProviderError);
    }
  });
});

describe("loadProvider", () => {
  it("wraps a missing optional package in MissingDependencyError", async () => {
    // Inject an importer that fails as if the `@ai-sdk/*` package were absent.
    await expect(
      loadProvider("xai", () =>
        Promise.reject(new Error("Cannot find package '@ai-sdk/xai'"))
      )
    ).rejects.toBeInstanceOf(MissingDependencyError);
  });

  it("rethrows an UnsupportedProviderError without masking it", async () => {
    // The default importer rejects unknown providers; that error must surface
    // as-is rather than being wrapped as a missing dependency.
    await expect(
      loadProvider("cohere" as BatchProvider)
    ).rejects.toBeInstanceOf(UnsupportedProviderError);
  });
});
