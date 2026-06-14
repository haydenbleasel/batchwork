import { afterEach, describe, expect, it, vi } from "vitest";

import { batch } from "../src/batch";

interface Route {
  body: unknown;
  match: (url: string, method: string) => boolean;
}

const install = (routes: Route[]) => {
  const fetchMock = vi.fn<
    (input: string | URL | Request, init?: RequestInit) => Promise<Response>
  >((input, init) => {
    const url = typeof input === "string" ? input : String(input);
    const method = init?.method ?? "GET";
    const route = routes.find((candidate) => candidate.match(url, method));
    if (!route) {
      return Promise.reject(new Error(`unexpected ${method} ${url}`));
    }
    const payload =
      typeof route.body === "string" ? route.body : JSON.stringify(route.body);
    return Promise.resolve(new Response(payload, { status: 200 }));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

describe("batch (end-to-end, mocked transport)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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
