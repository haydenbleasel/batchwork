import { describe, expect, it } from "bun:test";

import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";

import { buildEmbeddingBodies, buildRequestBodies } from "../src/body";
import { resolveModel } from "../src/model";

const NO_CREDENTIALS = {};

describe(resolveModel, () => {
  it("parses a provider/model string", () => {
    expect(resolveModel("openai/gpt-4o-mini")).toStrictEqual({
      kind: "chat",
      modelId: "gpt-4o-mini",
      provider: "openai",
    });
    expect(resolveModel("anthropic/claude-haiku-4-5")).toStrictEqual({
      kind: "chat",
      modelId: "claude-haiku-4-5",
      provider: "anthropic",
    });
  });

  it("reads provider + kind from a model object", () => {
    expect(resolveModel(openai.chat("gpt-4o-mini"))).toMatchObject({
      kind: "chat",
      modelId: "gpt-4o-mini",
      provider: "openai",
    });
    // The default `openai()` model targets the Responses API.
    expect(resolveModel(openai("gpt-4o-mini")).kind).toBe("responses");
    expect(resolveModel(anthropic("claude-haiku-4-5"))).toMatchObject({
      modelId: "claude-haiku-4-5",
      provider: "anthropic",
    });
  });

  it("throws on unsupported providers", () => {
    expect(() => resolveModel("cohere/command")).toThrow("not supported");
  });
});

describe(buildRequestBodies, () => {
  it("derives an OpenAI chat-completions body and endpoint", async () => {
    const resolved = resolveModel("openai/gpt-4o-mini");
    const built = await buildRequestBodies(
      resolved,
      [{ customId: "a", prompt: "Say hi" }],
      undefined,
      NO_CREDENTIALS
    );

    expect(built).toHaveLength(1);
    expect(built[0]?.customId).toBe("a");
    expect(built[0]?.endpoint).toBe("/v1/chat/completions");
    expect(built[0]?.body.model).toBe("gpt-4o-mini");
    expect(Array.isArray(built[0]?.body.messages)).toBeTruthy();
  });

  it("derives an Anthropic Messages body and merges defaults", async () => {
    const resolved = resolveModel("anthropic/claude-haiku-4-5");
    const built = await buildRequestBodies(
      resolved,
      [{ customId: "x", messages: [{ content: "Hi", role: "user" }] }],
      { maxOutputTokens: 64, system: "Be terse." },
      NO_CREDENTIALS
    );

    expect(built[0]?.endpoint).toBe("/v1/messages");
    expect(built[0]?.body.model).toBe("claude-haiku-4-5");
    expect(built[0]?.body.max_tokens).toBe(64);
    expect(built[0]?.body.system).toBeDefined();
  });

  it("auto-generates custom ids and rejects duplicates", async () => {
    const resolved = resolveModel("openai/gpt-4o-mini");
    const built = await buildRequestBodies(
      resolved,
      [{ prompt: "one" }, { prompt: "two" }],
      undefined,
      NO_CREDENTIALS
    );
    expect(built.map((item) => item.customId)).toStrictEqual([
      "request-0",
      "request-1",
    ]);

    await expect(
      buildRequestBodies(
        resolved,
        [
          { customId: "dup", prompt: "one" },
          { customId: "dup", prompt: "two" },
        ],
        undefined,
        NO_CREDENTIALS
      )
    ).rejects.toThrow("duplicate customId");
  });

  it("rejects batches above the request count limit", async () => {
    const resolved = resolveModel("openai/gpt-4o-mini");
    await expect(
      buildRequestBodies(
        resolved,
        [{ prompt: "one" }, { prompt: "two" }],
        undefined,
        NO_CREDENTIALS,
        { maxRequests: 1 }
      )
    ).rejects.toThrow("request limit");
  });

  it("rejects captured request bodies above the byte limit", async () => {
    const resolved = resolveModel("openai/gpt-4o-mini");
    await expect(
      buildRequestBodies(
        resolved,
        [{ customId: "big", prompt: "this body is too large" }],
        undefined,
        NO_CREDENTIALS,
        { maxRequestBytes: 8 }
      )
    ).rejects.toThrow('request "big"');
  });
});

describe(buildEmbeddingBodies, () => {
  it("derives an OpenAI embeddings body and endpoint", async () => {
    const resolved = resolveModel("openai/text-embedding-3-small");
    const built = await buildEmbeddingBodies(
      resolved,
      [{ customId: "a", value: "hello world" }],
      NO_CREDENTIALS
    );

    expect(built).toHaveLength(1);
    expect(built[0]?.customId).toBe("a");
    expect(built[0]?.endpoint).toBe("/v1/embeddings");
    expect(built[0]?.body.model).toBe("text-embedding-3-small");
    expect(built[0]?.body.input).toStrictEqual(["hello world"]);
    expect(built[0]?.body.encoding_format).toBe("float");
  });

  it("derives a Mistral embeddings body", async () => {
    const resolved = resolveModel("mistral/mistral-embed");
    const built = await buildEmbeddingBodies(
      resolved,
      [{ value: "hi" }],
      NO_CREDENTIALS
    );

    expect(built[0]?.customId).toBe("request-0");
    expect(built[0]?.endpoint).toBe("/v1/embeddings");
    expect(built[0]?.body.model).toBe("mistral-embed");
    expect(built[0]?.body.input).toBeDefined();
  });

  it("auto-generates custom ids and rejects duplicates", async () => {
    const resolved = resolveModel("openai/text-embedding-3-small");
    const built = await buildEmbeddingBodies(
      resolved,
      [{ value: "one" }, { value: "two" }],
      NO_CREDENTIALS
    );
    expect(built.map((item) => item.customId)).toStrictEqual([
      "request-0",
      "request-1",
    ]);

    await expect(
      buildEmbeddingBodies(
        resolved,
        [
          { customId: "dup", value: "one" },
          { customId: "dup", value: "two" },
        ],
        NO_CREDENTIALS
      )
    ).rejects.toThrow("duplicate customId");
  });

  it("rejects embeddings batches above the request count limit", async () => {
    const resolved = resolveModel("openai/text-embedding-3-small");
    await expect(
      buildEmbeddingBodies(
        resolved,
        [{ value: "one" }, { value: "two" }],
        NO_CREDENTIALS,
        { maxRequests: 1 }
      )
    ).rejects.toThrow("request limit");
  });

  it("rejects captured embedding bodies above the byte limit", async () => {
    const resolved = resolveModel("openai/text-embedding-3-small");
    await expect(
      buildEmbeddingBodies(
        resolved,
        [{ customId: "big", value: "this embedding body is too large" }],
        NO_CREDENTIALS,
        { maxRequestBytes: 8 }
      )
    ).rejects.toThrow('request "big"');
  });

  it("rejects providers without an embedding model", async () => {
    const resolved = resolveModel("anthropic/claude-haiku-4-5");
    await expect(
      buildEmbeddingBodies(resolved, [{ value: "hi" }], NO_CREDENTIALS)
    ).rejects.toThrow("does not offer batch embeddings");
  });
});
