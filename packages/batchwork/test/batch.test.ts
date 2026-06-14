import { afterEach, describe, expect, it, mock } from "bun:test";

import { batch, cancelBatch, getBatch, getBatchResults } from "../src/batch";
import type { BatchResult } from "../src/types";

interface Route {
  body: unknown;
  match: (url: string, method: string) => boolean;
}

const originalFetch = globalThis.fetch;

const install = (routes: Route[]) => {
  const fetchMock = mock(
    (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : String(input);
      const method = init?.method ?? "GET";
      const route = routes.find((candidate) => candidate.match(url, method));
      if (!route) {
        return Promise.reject(new Error(`unexpected ${method} ${url}`));
      }
      const payload =
        typeof route.body === "string"
          ? route.body
          : JSON.stringify(route.body);
      return Promise.resolve(new Response(payload, { status: 200 }));
    }
  );
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  return fetchMock;
};

describe("batch (end-to-end, mocked transport)", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("submits, waits, and collects an OpenAI batch", async () => {
    install([
      {
        body: { id: "file-in" },
        match: (url, method) => url.endsWith("/files") && method === "POST",
      },
      {
        body: {
          id: "batch_1",
          request_counts: { completed: 0, failed: 0, total: 1 },
          status: "validating",
        },
        match: (url, method) => url.endsWith("/batches") && method === "POST",
      },
      {
        body: {
          id: "batch_1",
          output_file_id: "file-out",
          request_counts: { completed: 1, failed: 0, total: 1 },
          status: "completed",
        },
        match: (url, method) =>
          url.includes("/batches/batch_1") && method === "GET",
      },
      {
        body: '{"custom_id":"a","response":{"status_code":200,"body":{"choices":[{"message":{"content":"hi"}}]}}}',
        match: (url) => url.includes("/files/file-out/content"),
      },
    ]);

    const job = await batch({
      apiKey: "test-key",
      model: "openai/gpt-4o-mini",
      requests: [{ customId: "a", prompt: "Say hi" }],
    });

    expect(job).toMatchObject({
      id: "batch_1",
      provider: "openai",
      status: "validating",
    });

    const snapshot = await job.wait({ pollIntervalMs: 1 });
    expect(snapshot.status).toBe("completed");

    const results = await job.collect();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      customId: "a",
      status: "succeeded",
      text: "hi",
    });
  });

  it("rejects an empty request list", async () => {
    await expect(
      batch({ apiKey: "test-key", model: "openai/gpt-4o-mini", requests: [] })
    ).rejects.toThrow("must not be empty");
  });
});

const collect = async (
  source: AsyncIterable<BatchResult>
): Promise<BatchResult[]> => {
  const out: BatchResult[] = [];
  for await (const item of source) {
    out.push(item);
  }
  return out;
};

describe("getBatch / getBatchResults / cancelBatch", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("rehydrates a handle from a provider + id", async () => {
    install([
      {
        body: {
          id: "batch_1",
          request_counts: { completed: 1, failed: 0, total: 1 },
          status: "completed",
        },
        match: (url, method) =>
          url.includes("/batches/batch_1") && method === "GET",
      },
    ]);

    const job = await getBatch({
      apiKey: "k",
      id: "batch_1",
      provider: "openai",
    });
    expect(job).toMatchObject({ id: "batch_1", status: "completed" });
  });

  it("infers the provider from a model when no provider is given", async () => {
    install([
      {
        body: {
          id: "batch_2",
          request_counts: { completed: 0, failed: 0, total: 1 },
          status: "validating",
        },
        match: (url, method) =>
          url.includes("/batches/batch_2") && method === "GET",
      },
    ]);

    const job = await getBatch({
      apiKey: "k",
      id: "batch_2",
      model: "openai/gpt-4o-mini",
    });
    expect(job.provider).toBe("openai");
  });

  it("throws when neither provider nor model identifies the batch", async () => {
    await expect(getBatch({ apiKey: "k", id: "batch_3" })).rejects.toThrow(
      "provide `provider` or `model`"
    );
  });

  it("streams results for an existing batch by id", async () => {
    install([
      {
        body: {
          id: "batch_4",
          output_file_id: "file-out",
          request_counts: { completed: 1, failed: 0, total: 1 },
          status: "completed",
        },
        match: (url, method) =>
          url.includes("/batches/batch_4") && method === "GET",
      },
      {
        body: '{"custom_id":"a","response":{"status_code":200,"body":{"choices":[{"message":{"content":"hi"}}]}}}',
        match: (url) => url.includes("/files/file-out/content"),
      },
    ]);

    const results = await collect(
      getBatchResults({ apiKey: "k", id: "batch_4", provider: "openai" })
    );
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ customId: "a", status: "succeeded" });
  });

  it("cancels an existing batch by id", async () => {
    const fetchMock = install([
      {
        body: { id: "batch_5", status: "cancelling" },
        match: (url, method) => url.endsWith("/cancel") && method === "POST",
      },
    ]);

    await cancelBatch({ apiKey: "k", id: "batch_5", provider: "openai" });
    expect(
      fetchMock.mock.calls.some((call) =>
        String(call[0]).endsWith("/batches/batch_5/cancel")
      )
    ).toBe(true);
  });
});
