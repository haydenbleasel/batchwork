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

describe("batch.videos (end-to-end, mocked transport)", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("submits an xAI video batch against the video generations endpoint", async () => {
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
                response: {
                  video_response: {
                    status: "done",
                    video: {
                      duration: 5,
                      url: "https://signed.example/video.mp4",
                    },
                  },
                },
              },
            },
          ],
        },
        match: (url) => url.includes("/batches/batch_1/results"),
      },
    ]);

    const job = await batch.videos({
      apiKey: "test-key",
      model: "xai/grok-imagine-video",
      requests: [
        {
          aspectRatio: "16:9",
          customId: "a",
          duration: 5,
          prompt: "A red bicycle rolling downhill.",
        },
      ],
    });
    expect(job).toMatchObject({ id: "batch_1", provider: "xai" });

    const uploadCall = fetchMock.mock.calls.find(
      (call) => String(call[0]).endsWith("/files") && call[1]?.method === "POST"
    );
    const form = uploadCall?.[1]?.body as FormData;
    const jsonl = await (form.get("file") as Blob).text();
    expect(jsonl).toContain('"url":"/v1/videos/generations"');
    expect(jsonl).toContain('"model":"grok-imagine-video"');
    expect(jsonl).toContain('"prompt":"A red bicycle rolling downhill."');
    expect(jsonl).toContain('"duration":5');
    expect(jsonl).toContain('"aspect_ratio":"16:9"');

    await job.wait({ pollIntervalMs: 1 });
    const results = await job.collect();
    expect(results[0]).toMatchObject({
      customId: "a",
      status: "succeeded",
      videos: [{ durationSeconds: 5, url: "https://signed.example/video.mp4" }],
    });
    // A video completion's URL must not be misread as a hosted image.
    expect(results[0]?.images).toBeUndefined();
  });

  it("captures edit mode against the edits endpoint per line", async () => {
    const fetchMock = install([
      {
        body: { id: "file-in" },
        match: (url, method) => url.endsWith("/files") && method === "POST",
      },
      {
        body: { batch_id: "batch_1", state: { num_pending: 1 } },
        match: (url, method) => url.endsWith("/batches") && method === "POST",
      },
    ]);

    await batch.videos({
      apiKey: "test-key",
      model: "xai/grok-imagine-video",
      requests: [
        {
          customId: "generate",
          prompt: "A red bicycle rolling downhill.",
        },
        {
          customId: "edit",
          prompt: "Make the bicycle blue.",
          providerOptions: {
            xai: { videoUrl: "https://example.com/source.mp4" },
          },
        },
      ],
    });

    const uploadCall = fetchMock.mock.calls.find(
      (call) => String(call[0]).endsWith("/files") && call[1]?.method === "POST"
    );
    const form = uploadCall?.[1]?.body as FormData;
    const jsonl = await (form.get("file") as Blob).text();
    const [generateLine, editLine] = jsonl
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(generateLine).toMatchObject({ url: "/v1/videos/generations" });
    expect(editLine).toMatchObject({
      body: { video: { url: "https://example.com/source.mp4" } },
      url: "/v1/videos/edits",
    });
  });

  it("throws for a provider without batch video support", async () => {
    await expect(
      batch.videos({
        apiKey: "k",
        model: "openai/sora-2",
        requests: [{ prompt: "hi" }],
      })
    ).rejects.toThrow("does not offer batch video generation");
  });

  it("rejects an empty video request list", async () => {
    await expect(
      batch.videos({
        apiKey: "k",
        model: "xai/grok-imagine-video",
        requests: [],
      })
    ).rejects.toThrow("must not be empty");
  });
});
