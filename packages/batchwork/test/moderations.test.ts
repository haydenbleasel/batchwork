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

describe("batch.moderations (end-to-end, mocked transport)", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("submits an OpenAI moderation batch against the moderations endpoint", async () => {
    const fetchMock = install([
      {
        body: { id: "file-in" },
        match: (url, method) => url.endsWith("/files") && method === "POST",
      },
      {
        body: {
          id: "batch_1",
          request_counts: { completed: 0, failed: 0, total: 2 },
          status: "validating",
        },
        match: (url, method) => url.endsWith("/batches") && method === "POST",
      },
      {
        body: {
          id: "batch_1",
          output_file_id: "file-out",
          request_counts: { completed: 2, failed: 0, total: 2 },
          status: "completed",
        },
        match: (url, method) =>
          url.includes("/batches/batch_1") && method === "GET",
      },
      {
        body: [
          '{"custom_id":"ok","response":{"status_code":200,"body":{"id":"modr-1","model":"omni-moderation-latest","results":[{"flagged":false,"categories":{"violence":false,"hate":false},"category_scores":{"violence":0.001,"hate":0.002}}]}}}',
          '{"custom_id":"bad","response":{"status_code":200,"body":{"id":"modr-2","model":"omni-moderation-latest","results":[{"flagged":true,"categories":{"violence":true,"hate":false},"category_scores":{"violence":0.97,"hate":0.01}}]}}}',
        ].join("\n"),
        match: (url) => url.includes("/files/file-out/content"),
      },
    ]);

    const job = await batch.moderations({
      apiKey: "test-key",
      model: "openai/omni-moderation-latest",
      requests: [
        { customId: "ok", value: "What a lovely day." },
        { customId: "bad", value: "…something nasty…" },
      ],
    });
    expect(job).toMatchObject({ id: "batch_1", provider: "openai" });

    const createCall = fetchMock.mock.calls.find(
      (call) =>
        String(call[0]).endsWith("/batches") && call[1]?.method === "POST"
    );
    expect(String(createCall?.[1]?.body)).toContain(
      '"endpoint":"/v1/moderations"'
    );
    const uploadCall = fetchMock.mock.calls.find(
      (call) => String(call[0]).endsWith("/files") && call[1]?.method === "POST"
    );
    const form = uploadCall?.[1]?.body as FormData;
    const jsonl = await (form.get("file") as Blob).text();
    expect(jsonl).toContain('"url":"/v1/moderations"');
    expect(jsonl).toContain('"model":"omni-moderation-latest"');
    expect(jsonl).toContain('"input":"What a lovely day."');

    await job.wait({ pollIntervalMs: 1 });
    const results = await job.collect();
    expect(results.find((r) => r.customId === "ok")).toMatchObject({
      moderation: {
        categories: { hate: false, violence: false },
        categoryScores: { hate: 0.002, violence: 0.001 },
        flagged: false,
      },
      status: "succeeded",
    });
    expect(results.find((r) => r.customId === "bad")?.moderation?.flagged).toBe(
      true
    );
  });

  it("builds an OpenAI content-part input when imageUrls are given", async () => {
    const fetchMock = install([
      {
        body: { id: "file-in" },
        match: (url, method) => url.endsWith("/files") && method === "POST",
      },
      {
        body: { id: "batch_1", status: "validating" },
        match: (url, method) => url.endsWith("/batches") && method === "POST",
      },
    ]);

    await batch.moderations({
      apiKey: "test-key",
      model: "openai/omni-moderation-latest",
      requests: [
        {
          customId: "a",
          imageUrls: ["https://example.com/upload.png"],
          value: "check this",
        },
      ],
    });

    const uploadCall = fetchMock.mock.calls.find(
      (call) => String(call[0]).endsWith("/files") && call[1]?.method === "POST"
    );
    const form = uploadCall?.[1]?.body as FormData;
    const jsonl = await (form.get("file") as Blob).text();
    expect(jsonl).toContain('{"text":"check this","type":"text"}');
    expect(jsonl).toContain(
      '{"image_url":{"url":"https://example.com/upload.png"},"type":"image_url"}'
    );
  });

  it("submits a Mistral moderation batch and computes flagged from categories", async () => {
    const fetchMock = install([
      {
        body: { id: "file-in" },
        match: (url, method) => url.endsWith("/files") && method === "POST",
      },
      {
        body: { id: "job_1", status: "QUEUED", total_requests: 1 },
        match: (url, method) =>
          url.endsWith("/batch/jobs") && method === "POST",
      },
      {
        body: {
          id: "job_1",
          output_file: "file-out",
          status: "SUCCESS",
          succeeded_requests: 1,
          total_requests: 1,
        },
        match: (url, method) =>
          url.includes("/batch/jobs/job_1") && method === "GET",
      },
      {
        // Mistral reports categories without a top-level `flagged`.
        body: '{"custom_id":"a","response":{"status_code":200,"body":{"id":"mod-1","model":"mistral-moderation-latest","results":[{"categories":{"violence_and_threats":true,"pii":false},"category_scores":{"violence_and_threats":0.93,"pii":0.01}}]}}}',
        match: (url) => url.includes("/files/file-out/content"),
      },
    ]);

    const job = await batch.moderations({
      apiKey: "test-key",
      model: "mistral/mistral-moderation-latest",
      requests: [{ customId: "a", value: "…something threatening…" }],
    });
    expect(job.provider).toBe("mistral");

    const createCall = fetchMock.mock.calls.find(
      (call) =>
        String(call[0]).endsWith("/batch/jobs") && call[1]?.method === "POST"
    );
    expect(String(createCall?.[1]?.body)).toContain(
      '"endpoint":"/v1/moderations"'
    );
    expect(String(createCall?.[1]?.body)).toContain(
      '"model":"mistral-moderation-latest"'
    );
    const uploadCall = fetchMock.mock.calls.find(
      (call) => String(call[0]).endsWith("/files") && call[1]?.method === "POST"
    );
    const form = uploadCall?.[1]?.body as FormData;
    const jsonl = await (form.get("file") as Blob).text();
    expect(jsonl).toContain('"input":"…something threatening…"');
    expect(jsonl).not.toContain('"model"');

    await job.wait({ pollIntervalMs: 1 });
    const results = await job.collect();
    expect(results[0]).toMatchObject({
      customId: "a",
      moderation: {
        categories: { pii: false, violence_and_threats: true },
        categoryScores: { pii: 0.01, violence_and_threats: 0.93 },
        flagged: true,
      },
      status: "succeeded",
    });
  });

  it("rejects imageUrls for Mistral before any network request", async () => {
    await expect(
      batch.moderations({
        apiKey: "k",
        model: "mistral/mistral-moderation-latest",
        requests: [{ customId: "a", imageUrls: ["https://example.com/x.png"] }],
      })
    ).rejects.toThrow("Mistral moderation is text-only");
  });

  it("rejects a request with neither value nor imageUrls", async () => {
    await expect(
      batch.moderations({
        apiKey: "k",
        model: "openai/omni-moderation-latest",
        requests: [{ customId: "a" }],
      })
    ).rejects.toThrow("needs `value` or `imageUrls`");
  });

  it("throws for a provider without batch moderation support", async () => {
    await expect(
      batch.moderations({
        apiKey: "k",
        model: "groq/llama-guard-4-12b",
        requests: [{ value: "hi" }],
      })
    ).rejects.toThrow("does not offer batch moderation");
  });

  it("rejects an empty moderation request list", async () => {
    await expect(
      batch.moderations({
        apiKey: "k",
        model: "openai/omni-moderation-latest",
        requests: [],
      })
    ).rejects.toThrow("must not be empty");
  });
});
