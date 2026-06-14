import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { describe, expect, it } from "vitest";

import { buildRequestBodies } from "../src/body";
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
});
