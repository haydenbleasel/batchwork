import { describe, expect, it } from "bun:test";

import {
  BatchworkError,
  MissingDependencyError,
  UnsupportedProviderError,
} from "../src/errors";

describe("BatchworkError", () => {
  it("sets the name and forwards a cause", () => {
    const cause = new Error("root");
    const error = new BatchworkError("boom", { cause });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("BatchworkError");
    expect(error.message).toBe("boom");
    expect(error.cause).toBe(cause);
  });
});

describe("UnsupportedProviderError", () => {
  it("records the provider and lists the supported ones", () => {
    const error = new UnsupportedProviderError("cohere");
    expect(error).toBeInstanceOf(BatchworkError);
    expect(error.name).toBe("UnsupportedProviderError");
    expect(error.provider).toBe("cohere");
    expect(error.message).toContain('provider "cohere" is not supported');
    expect(error.message).toContain("openai, anthropic");
  });
});

describe("MissingDependencyError", () => {
  it("names the package to install", () => {
    const error = new MissingDependencyError("@ai-sdk/xai", "xAI");
    expect(error).toBeInstanceOf(BatchworkError);
    expect(error.name).toBe("MissingDependencyError");
    expect(error.message).toContain("@ai-sdk/xai");
    expect(error.message).toContain("xAI");
    expect(error.message).toContain("npm install @ai-sdk/xai");
  });
});
