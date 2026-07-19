import { afterEach, describe, expect, it, mock } from "bun:test";

import { createGroq } from "@ai-sdk/groq";

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

const AUDIO_URL = "https://example.com/call.wav";

describe("batch.transcriptions (end-to-end, mocked transport)", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("submits a Groq transcription batch against the audio endpoint", async () => {
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
        body: '{"custom_id":"a","response":{"status_code":200,"body":{"text":"Hello world.","language":"en","duration":1.4,"segments":[{"id":0,"start":0,"end":1.4,"text":"Hello world."}]}}}',
        match: (url) => url.includes("/files/file-out/content"),
      },
    ]);

    const job = await batch.transcriptions({
      apiKey: "test-key",
      model: createGroq({ apiKey: "test-key" }).transcription(
        "whisper-large-v3"
      ),
      requests: [
        {
          audioUrl: AUDIO_URL,
          customId: "a",
          language: "en",
          timestampGranularities: ["segment"],
        },
      ],
    });
    expect(job).toMatchObject({ id: "batch_1", provider: "groq" });

    const createCall = fetchMock.mock.calls.find(
      (call) =>
        String(call[0]).endsWith("/batches") && call[1]?.method === "POST"
    );
    expect(String(createCall?.[1]?.body)).toContain(
      '"endpoint":"/v1/audio/transcriptions"'
    );
    const uploadCall = fetchMock.mock.calls.find(
      (call) => String(call[0]).endsWith("/files") && call[1]?.method === "POST"
    );
    const form = uploadCall?.[1]?.body as FormData;
    const jsonl = await (form.get("file") as Blob).text();
    // The per-line `url` targets the audio endpoint; the audio file rides in
    // the body's `url` field (Groq batch takes hosted URLs, not file uploads).
    expect(jsonl).toContain('"url":"/v1/audio/transcriptions"');
    expect(jsonl).toContain(`"url":"${AUDIO_URL}"`);
    expect(jsonl).toContain('"model":"whisper-large-v3"');
    expect(jsonl).toContain('"language":"en"');
    expect(jsonl).toContain('"response_format":"verbose_json"');
    expect(jsonl).toContain('"timestamp_granularities":["segment"]');

    await job.wait({ pollIntervalMs: 1 });
    const results = await job.collect();
    expect(results[0]).toMatchObject({
      customId: "a",
      segments: [{ endSecond: 1.4, startSecond: 0, text: "Hello world." }],
      status: "succeeded",
      text: "Hello world.",
    });
  });

  it("submits a Mistral transcription batch with the model on the job", async () => {
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
        body: '{"custom_id":"a","response":{"status_code":200,"body":{"model":"voxtral-mini-latest","text":"Bonjour.","language":"fr","usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12}}}}',
        match: (url) => url.includes("/files/file-out/content"),
      },
    ]);

    const job = await batch.transcriptions({
      apiKey: "test-key",
      model: "mistral/voxtral-mini-latest",
      requests: [{ audioUrl: AUDIO_URL, customId: "a" }],
    });
    expect(job.provider).toBe("mistral");

    const createCall = fetchMock.mock.calls.find(
      (call) =>
        String(call[0]).endsWith("/batch/jobs") && call[1]?.method === "POST"
    );
    expect(String(createCall?.[1]?.body)).toContain(
      '"endpoint":"/v1/audio/transcriptions"'
    );
    expect(String(createCall?.[1]?.body)).toContain(
      '"model":"voxtral-mini-latest"'
    );
    const uploadCall = fetchMock.mock.calls.find(
      (call) => String(call[0]).endsWith("/files") && call[1]?.method === "POST"
    );
    const form = uploadCall?.[1]?.body as FormData;
    const jsonl = await (form.get("file") as Blob).text();
    expect(jsonl).toContain(`"file_url":"${AUDIO_URL}"`);
    // Mistral carries the model on the job, so it is stripped from each line.
    expect(jsonl).not.toContain('"model"');

    await job.wait({ pollIntervalMs: 1 });
    const results = await job.collect();
    expect(results[0]).toMatchObject({
      customId: "a",
      status: "succeeded",
      text: "Bonjour.",
      usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 },
    });
    expect(results[0]?.segments).toBeUndefined();
  });

  it("merges defaults and provider options into the request body", async () => {
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

    await batch.transcriptions({
      apiKey: "test-key",
      defaults: { language: "en" },
      model: "groq/whisper-large-v3",
      requests: [
        {
          audioUrl: AUDIO_URL,
          customId: "a",
          providerOptions: { groq: { temperature: 0 } },
        },
      ],
    });

    const uploadCall = fetchMock.mock.calls.find(
      (call) => String(call[0]).endsWith("/files") && call[1]?.method === "POST"
    );
    const form = uploadCall?.[1]?.body as FormData;
    const jsonl = await (form.get("file") as Blob).text();
    expect(jsonl).toContain('"language":"en"');
    expect(jsonl).toContain('"temperature":0');
  });

  it("throws for a provider without batch transcription support", async () => {
    await expect(
      batch.transcriptions({
        apiKey: "k",
        model: "openai/whisper-1",
        requests: [{ audioUrl: AUDIO_URL }],
      })
    ).rejects.toThrow("does not offer batch transcription");
  });

  it("rejects an empty transcription request list", async () => {
    await expect(
      batch.transcriptions({
        apiKey: "k",
        model: "groq/whisper-large-v3",
        requests: [],
      })
    ).rejects.toThrow("must not be empty");
  });
});
