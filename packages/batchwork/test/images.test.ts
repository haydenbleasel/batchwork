import { afterEach, describe, expect, it, mock } from "bun:test";

import { batch } from "../src/batch";

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

describe("batch.images (end-to-end, mocked transport)", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("submits an OpenAI image batch against the images endpoint", async () => {
    const fetchMock = install([
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
        body: '{"custom_id":"a","response":{"status_code":200,"body":{"created":1,"data":[{"b64_json":"aGVsbG8="}],"output_format":"png","usage":{"input_tokens":10,"output_tokens":20,"total_tokens":30}}}}',
        match: (url) => url.includes("/files/file-out/content"),
      },
    ]);

    const job = await batch.images({
      apiKey: "test-key",
      model: "openai/gpt-image-2",
      requests: [{ customId: "a", prompt: "a red bicycle" }],
    });
    expect(job).toMatchObject({ id: "batch_1", provider: "openai" });

    const createCall = fetchMock.mock.calls.find(
      (call) =>
        String(call[0]).endsWith("/batches") && call[1]?.method === "POST"
    );
    expect(String(createCall?.[1]?.body)).toContain(
      '"endpoint":"/v1/images/generations"'
    );
    // The per-line `url` must also target the images endpoint.
    const uploadCall = fetchMock.mock.calls.find(
      (call) => String(call[0]).endsWith("/files") && call[1]?.method === "POST"
    );
    const form = uploadCall?.[1]?.body as FormData;
    const jsonl = await (form.get("file") as Blob).text();
    expect(jsonl).toContain('"url":"/v1/images/generations"');

    await job.wait({ pollIntervalMs: 1 });
    const results = await job.collect();
    expect(results[0]).toMatchObject({
      customId: "a",
      images: [{ data: "aGVsbG8=", mediaType: "image/png" }],
      status: "succeeded",
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    });
  });

  it("submits a Google image batch via :batchGenerateContent and reads inline images", async () => {
    const fetchMock = install([
      {
        body: { metadata: { state: "JOB_STATE_PENDING" }, name: "batches/1" },
        match: (url, method) =>
          url.includes(":batchGenerateContent") && method === "POST",
      },
      {
        body: {
          done: true,
          metadata: { state: "JOB_STATE_SUCCEEDED" },
          name: "batches/1",
          response: {
            inlinedResponses: {
              inlinedResponses: [
                {
                  metadata: { key: "a" },
                  response: {
                    candidates: [
                      {
                        content: {
                          parts: [
                            {
                              inlineData: {
                                data: "aW1n",
                                mimeType: "image/png",
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        },
        match: (_url, method) => method === "GET",
      },
    ]);

    const job = await batch.images({
      apiKey: "test-key",
      model: "google/gemini-2.5-flash-image",
      requests: [{ customId: "a", prompt: "a red bicycle" }],
    });
    expect(job.provider).toBe("google");
    expect(
      fetchMock.mock.calls.some((call) =>
        String(call[0]).includes(
          "/models/gemini-2.5-flash-image:batchGenerateContent"
        )
      )
    ).toBe(true);

    await job.wait({ pollIntervalMs: 1 });
    const results = await job.collect();
    expect(results[0]).toMatchObject({
      customId: "a",
      images: [{ data: "aW1n", mediaType: "image/png" }],
      status: "succeeded",
    });
  });

  it("submits an xAI image batch and reads images from image_response", async () => {
    const fetchMock = install([
      {
        body: { id: "file-in" },
        match: (url, method) => url.endsWith("/files") && method === "POST",
      },
      {
        body: {
          batch_id: "batch_1",
          state: { num_pending: 1, num_requests: 1 },
        },
        match: (url, method) => url.endsWith("/batches") && method === "POST",
      },
      {
        body: {
          batch_id: "batch_1",
          state: { num_pending: 0, num_requests: 1, num_success: 1 },
        },
        match: (url, method) =>
          url.endsWith("/batches/batch_1") && method === "GET",
      },
      {
        body: {
          results: [
            {
              batch_request_id: "a",
              batch_result: {
                response: { image_response: { base64: "aW1n" } },
              },
            },
          ],
        },
        match: (url) => url.includes("/batches/batch_1/results"),
      },
    ]);

    const job = await batch.images({
      apiKey: "test-key",
      model: "xai/grok-imagine-image-quality",
      requests: [{ customId: "a", prompt: "a red bicycle" }],
    });
    expect(job.provider).toBe("xai");

    const uploadCall = fetchMock.mock.calls.find(
      (call) => String(call[0]).endsWith("/files") && call[1]?.method === "POST"
    );
    const form = uploadCall?.[1]?.body as FormData;
    const jsonl = await (form.get("file") as Blob).text();
    expect(jsonl).toContain('"url":"/v1/images/generations"');

    await job.wait({ pollIntervalMs: 1 });
    const results = await job.collect();
    expect(results[0]).toMatchObject({
      customId: "a",
      images: [{ data: "aW1n" }],
      status: "succeeded",
    });
  });

  it("throws for a provider without batch image support", async () => {
    await expect(
      batch.images({
        apiKey: "k",
        model: "anthropic/claude-haiku-4-5",
        requests: [{ prompt: "hi" }],
      })
    ).rejects.toThrow("does not offer batch image generation");
  });

  it("rejects an empty image request list", async () => {
    await expect(
      batch.images({ apiKey: "k", model: "openai/gpt-image-2", requests: [] })
    ).rejects.toThrow("must not be empty");
  });
});
