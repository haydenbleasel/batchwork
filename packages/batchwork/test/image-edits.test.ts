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

const SOURCE_URL = "https://example.com/bicycle.png";

describe("batch.images.edit (end-to-end, mocked transport)", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("submits an OpenAI image-edit batch against the edits endpoint", async () => {
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
        body: '{"custom_id":"a","response":{"status_code":200,"body":{"created":1,"data":[{"b64_json":"ZWRpdGVk"}],"output_format":"png"}}}',
        match: (url) => url.includes("/files/file-out/content"),
      },
    ]);

    const job = await batch.images.edit({
      apiKey: "test-key",
      model: "openai/gpt-image-2",
      requests: [
        {
          customId: "a",
          images: [{ imageUrl: SOURCE_URL }],
          mask: { fileId: "file-mask" },
          prompt: "Make the bicycle blue.",
          size: "1024x1024",
        },
      ],
    });
    expect(job).toMatchObject({ id: "batch_1", provider: "openai" });

    const createCall = fetchMock.mock.calls.find(
      (call) =>
        String(call[0]).endsWith("/batches") && call[1]?.method === "POST"
    );
    expect(String(createCall?.[1]?.body)).toContain(
      '"endpoint":"/v1/images/edits"'
    );
    const uploadCall = fetchMock.mock.calls.find(
      (call) => String(call[0]).endsWith("/files") && call[1]?.method === "POST"
    );
    const form = uploadCall?.[1]?.body as FormData;
    const jsonl = await (form.get("file") as Blob).text();
    expect(jsonl).toContain('"url":"/v1/images/edits"');
    expect(jsonl).toContain(`"images":[{"image_url":"${SOURCE_URL}"}]`);
    expect(jsonl).toContain('"mask":{"file_id":"file-mask"}');
    expect(jsonl).toContain('"model":"gpt-image-2"');
    expect(jsonl).toContain('"size":"1024x1024"');

    await job.wait({ pollIntervalMs: 1 });
    const results = await job.collect();
    expect(results[0]).toMatchObject({
      customId: "a",
      images: [{ data: "ZWRpdGVk", mediaType: "image/png" }],
      status: "succeeded",
    });
  });

  it("submits an xAI image-edit batch with URL references", async () => {
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

    await batch.images.edit({
      apiKey: "test-key",
      model: "xai/grok-imagine-image-quality",
      requests: [
        {
          customId: "single",
          images: [{ imageUrl: SOURCE_URL }],
          prompt: "Add a rainbow.",
        },
        {
          customId: "multi",
          images: [
            { imageUrl: SOURCE_URL },
            { imageUrl: "https://example.com/sky.png" },
          ],
          prompt: "Blend these together.",
        },
      ],
    });

    const uploadCall = fetchMock.mock.calls.find(
      (call) => String(call[0]).endsWith("/files") && call[1]?.method === "POST"
    );
    const form = uploadCall?.[1]?.body as FormData;
    const jsonl = await (form.get("file") as Blob).text();
    const [single, multi] = jsonl
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(single).toMatchObject({
      body: { image: { url: SOURCE_URL }, prompt: "Add a rainbow." },
      url: "/v1/images/edits",
    });
    expect(multi).toMatchObject({
      body: {
        images: [{ url: SOURCE_URL }, { url: "https://example.com/sky.png" }],
      },
      url: "/v1/images/edits",
    });
  });

  it("exposes batch.images.create as an alias of batch.images", () => {
    expect(batch.images.create).toBe(
      batch.images as unknown as typeof batch.images.create
    );
  });

  it("rejects xAI-unsupported inputs before any network request", async () => {
    const edit = (request: Record<string, unknown>) =>
      batch.images.edit({
        apiKey: "k",
        model: "xai/grok-imagine-image-quality",
        requests: [
          {
            images: [{ imageUrl: SOURCE_URL }],
            prompt: "p",
            ...request,
          },
        ],
      });

    await expect(edit({ mask: { imageUrl: SOURCE_URL } })).rejects.toThrow(
      "do not support masks"
    );
    await expect(edit({ size: "1024x1024" })).rejects.toThrow("aspect_ratio");
    await expect(edit({ images: [{ fileId: "file-1" }] })).rejects.toThrow(
      "image URLs only"
    );
  });

  it("rejects a request with no source images", async () => {
    await expect(
      batch.images.edit({
        apiKey: "k",
        model: "openai/gpt-image-2",
        requests: [{ images: [], prompt: "p" }],
      })
    ).rejects.toThrow("at least one entry in `images`");
  });

  it("throws for a provider without batch image-edit support", async () => {
    await expect(
      batch.images.edit({
        apiKey: "k",
        model: "google/gemini-3.1-flash-image",
        requests: [{ images: [{ imageUrl: SOURCE_URL }], prompt: "p" }],
      })
    ).rejects.toThrow("does not offer batch image editing");
  });

  it("rejects an empty image-edit request list", async () => {
    await expect(
      batch.images.edit({
        apiKey: "k",
        model: "openai/gpt-image-2",
        requests: [],
      })
    ).rejects.toThrow("must not be empty");
  });
});
