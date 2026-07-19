import { afterEach, describe, expect, it, mock } from "bun:test";

import { batch } from "../src/batch";

interface Route {
  body: unknown;
  headers?: Record<string, string>;
  match: (url: string, method: string) => boolean;
  status?: number;
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
      return Promise.resolve(
        new Response(payload, {
          headers: route.headers,
          status: route.status ?? 200,
        })
      );
    }
  );
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  return fetchMock;
};

const AUDIO_URL = "https://example.com/french.wav";

describe("batch.translations (end-to-end, mocked transport)", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("submits a Groq translation batch against the translations endpoint", async () => {
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
        body: '{"custom_id":"a","response":{"status_code":200,"body":{"text":"Hello, how are you?","segments":[{"start":0,"end":2.1,"text":"Hello, how are you?"}]}}}',
        match: (url) => url.includes("/files/file-out/content"),
      },
    ]);

    const job = await batch.translations({
      apiKey: "test-key",
      model: "groq/whisper-large-v3",
      requests: [
        {
          audioUrl: AUDIO_URL,
          customId: "a",
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
      '"endpoint":"/v1/audio/translations"'
    );
    const uploadCall = fetchMock.mock.calls.find(
      (call) => String(call[0]).endsWith("/files") && call[1]?.method === "POST"
    );
    const form = uploadCall?.[1]?.body as FormData;
    const jsonl = await (form.get("file") as Blob).text();
    expect(jsonl).toContain('"url":"/v1/audio/translations"');
    expect(jsonl).toContain(`"url":"${AUDIO_URL}"`);
    expect(jsonl).toContain('"model":"whisper-large-v3"');
    expect(jsonl).toContain('"response_format":"verbose_json"');
    // Translations always output English; no language field exists to send.
    expect(jsonl).not.toContain('"language"');

    await job.wait({ pollIntervalMs: 1 });
    const results = await job.collect();
    expect(results[0]).toMatchObject({
      customId: "a",
      segments: [
        { endSecond: 2.1, startSecond: 0, text: "Hello, how are you?" },
      ],
      status: "succeeded",
      text: "Hello, how are you?",
    });
  });

  it("submits a Together translation batch with FILE-method lines", async () => {
    const storageUrl = "https://storage.example/presigned-put";
    const fetchMock = install([
      {
        body: "",
        headers: { Location: storageUrl, "X-Together-File-Id": "file-in" },
        match: (url, method) => url.endsWith("/files") && method === "POST",
        status: 302,
      },
      {
        body: "",
        match: (url, method) => url === storageUrl && method === "PUT",
      },
      {
        body: { id: "file-in" },
        match: (url, method) =>
          url.endsWith("/files/file-in/preprocess") && method === "POST",
      },
      {
        body: { id: "batch_1", status: "validating" },
        match: (url, method) => url.endsWith("/batches") && method === "POST",
      },
    ]);

    const job = await batch.translations({
      apiKey: "test-key",
      model: "together/openai/whisper-large-v3",
      requests: [{ audioUrl: AUDIO_URL, customId: "a" }],
    });
    expect(job.provider).toBe("together");

    const createCall = fetchMock.mock.calls.find(
      (call) =>
        String(call[0]).endsWith("/batches") && call[1]?.method === "POST"
    );
    expect(String(createCall?.[1]?.body)).toContain(
      '"endpoint":"/v1/audio/translations"'
    );
    const putCall = fetchMock.mock.calls.find(
      (call) => String(call[0]) === storageUrl && call[1]?.method === "PUT"
    );
    const jsonl = String(putCall?.[1]?.body);
    expect(jsonl).toContain('"method":"FILE"');
    expect(jsonl).toContain(`"file":"${AUDIO_URL}"`);
  });

  it("throws for a provider without batch translation support", async () => {
    await expect(
      batch.translations({
        apiKey: "k",
        model: "mistral/voxtral-mini-latest",
        requests: [{ audioUrl: AUDIO_URL }],
      })
    ).rejects.toThrow("does not offer batch translation");
  });

  it("rejects an empty translation request list", async () => {
    await expect(
      batch.translations({
        apiKey: "k",
        model: "groq/whisper-large-v3",
        requests: [],
      })
    ).rejects.toThrow("must not be empty");
  });
});
