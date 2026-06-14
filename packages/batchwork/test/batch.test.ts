import { afterEach, describe, expect, it, vi } from "vitest";
import { batch } from "../src/batch";

interface Route {
  body: unknown;
  match: (url: string, method: string) => boolean;
}

function install(routes: Route[]) {
  const fetchMock = vi.fn(
    (input: string | URL | Request, init?: RequestInit) => {
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
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("batch (end-to-end, mocked transport)", () => {
  it("submits, waits, and collects an OpenAI batch", async () => {
    install([
      {
        match: (url, method) => url.endsWith("/files") && method === "POST",
        body: { id: "file-in" },
      },
      {
        match: (url, method) => url.endsWith("/batches") && method === "POST",
        body: {
          id: "batch_1",
          status: "validating",
          request_counts: { total: 1, completed: 0, failed: 0 },
        },
      },
      {
        match: (url, method) =>
          url.includes("/batches/batch_1") && method === "GET",
        body: {
          id: "batch_1",
          status: "completed",
          output_file_id: "file-out",
          request_counts: { total: 1, completed: 1, failed: 0 },
        },
      },
      {
        match: (url) => url.includes("/files/file-out/content"),
        body: '{"custom_id":"a","response":{"status_code":200,"body":{"choices":[{"message":{"content":"hi"}}]}}}',
      },
    ]);

    const job = await batch({
      model: "openai/gpt-4o-mini",
      apiKey: "test-key",
      requests: [{ customId: "a", prompt: "Say hi" }],
    });

    expect(job.provider).toBe("openai");
    expect(job.id).toBe("batch_1");
    expect(job.status).toBe("validating");

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
      batch({ model: "openai/gpt-4o-mini", apiKey: "test-key", requests: [] })
    ).rejects.toThrow("must not be empty");
  });
});
