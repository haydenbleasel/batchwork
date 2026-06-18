import { afterEach, describe, expect, it, mock } from "bun:test";

import { anthropicAdapter } from "../src/providers/anthropic";
import { googleAdapter } from "../src/providers/google";
import { groqAdapter } from "../src/providers/groq";
import { mistralAdapter } from "../src/providers/mistral";
import { openaiAdapter } from "../src/providers/openai";
import { togetherAdapter } from "../src/providers/together";
import { xaiAdapter } from "../src/providers/xai";
import type { BatchResult } from "../src/types";

const credentials = { apiKey: "test-key" };

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

const collect = async (
  source: AsyncIterable<BatchResult>
): Promise<BatchResult[]> => {
  const out: BatchResult[] = [];
  for await (const item of source) {
    out.push(item);
  }
  return out;
};

const uploadedForm = (call: readonly unknown[] | undefined): FormData => {
  const init = call?.[1] as RequestInit | undefined;
  return init?.body as FormData;
};

const uploadedJsonl = async (
  call: readonly unknown[] | undefined
): Promise<Record<string, unknown>[]> => {
  const form = uploadedForm(call);
  const file = form.get("file") as Blob;
  const text = await file.text();
  return text
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
};

describe("anthropic adapter", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("submits an inline request array and normalizes the snapshot", async () => {
    const fetchMock = install([
      {
        body: {
          created_at: "2026-01-01T00:00:00Z",
          expires_at: "2026-01-02T00:00:00Z",
          id: "msgbatch_1",
          processing_status: "in_progress",
          request_counts: {
            canceled: 0,
            errored: 0,
            expired: 0,
            processing: 2,
            succeeded: 0,
          },
          results_url: null,
        },
        match: (url, method) =>
          url.endsWith("/v1/messages/batches") && method === "POST",
      },
    ]);

    const snapshot = await anthropicAdapter.submit({
      built: [
        {
          body: {
            max_tokens: 10,
            messages: [],
            model: "claude",
            stream: false,
          },
          customId: "a",
          endpoint: "/v1/messages",
        },
      ],
      credentials,
      endpoint: "/v1/messages",
      modelId: "claude",
    });

    expect(snapshot.id).toBe("msgbatch_1");
    expect(snapshot.status).toBe("in_progress");
    expect(snapshot.requestCounts.total).toBe(2);

    // `stream` is stripped and the request is sent inline (no file upload).
    const sentBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(sentBody.requests[0].params.stream).toBeUndefined();
    expect(sentBody.requests[0].custom_id).toBe("a");
  });

  it("normalizes every result outcome", async () => {
    const jsonl = [
      '{"custom_id":"a","result":{"type":"succeeded","message":{"content":[{"type":"text","text":"Hello"}],"usage":{"input_tokens":5,"output_tokens":2}}}}',
      '{"custom_id":"b","result":{"type":"errored","error":{"type":"error","error":{"type":"invalid_request_error","message":"bad"}}}}',
      '{"custom_id":"c","result":{"type":"expired"}}',
      '{"custom_id":"d","result":{"type":"canceled"}}',
    ].join("\n");

    install([
      {
        body: {
          id: "b1",
          processing_status: "ended",
          request_counts: {
            canceled: 1,
            errored: 1,
            expired: 1,
            processing: 0,
            succeeded: 1,
          },
          results_url:
            "https://api.anthropic.com/v1/messages/batches/b1/results",
        },
        match: (url, method) =>
          url.endsWith("/v1/messages/batches/b1") && method === "GET",
      },
      { body: jsonl, match: (url) => url.endsWith("/results") },
    ]);

    const out = await collect(anthropicAdapter.results("b1", credentials));
    expect(out.map((item) => item.status)).toStrictEqual([
      "succeeded",
      "errored",
      "expired",
      "canceled",
    ]);
    expect(out[0]?.text).toBe("Hello");
    expect(out[0]?.usage).toStrictEqual({
      inputTokens: 5,
      outputTokens: 2,
      totalTokens: 7,
    });
    expect(out[1]?.error?.message).toBe("bad");
    expect(out[1]?.error?.type).toBe("invalid_request_error");
  });
});

describe("openai adapter", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("uploads a JSONL file then creates the batch", async () => {
    const fetchMock = install([
      {
        body: { id: "file-in" },
        match: (url, method) => url.endsWith("/files") && method === "POST",
      },
      {
        body: {
          created_at: 1_719_168_000,
          expires_at: 1_719_254_400,
          id: "batch_1",
          request_counts: { completed: 0, failed: 0, total: 1 },
          status: "validating",
        },
        match: (url, method) => url.endsWith("/batches") && method === "POST",
      },
    ]);

    const snapshot = await openaiAdapter.submit({
      built: [
        {
          body: { messages: [], model: "gpt-4o-mini" },
          customId: "a",
          endpoint: "/v1/chat/completions",
        },
      ],
      credentials,
      endpoint: "/v1/chat/completions",
      modelId: "gpt-4o-mini",
    });

    expect(snapshot.id).toBe("batch_1");
    expect(snapshot.status).toBe("validating");
    // OpenAI derives the name from the file part; no explicit `file_name` field.
    expect(uploadedForm(fetchMock.mock.calls[0]).has("file_name")).toBe(false);
    // The create call references the uploaded file id.
    const createBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(createBody.input_file_id).toBe("file-in");
    expect(createBody.endpoint).toBe("/v1/chat/completions");
    expect(createBody.completion_window).toBe("24h");
  });

  it("rejects JSONL uploads above the byte limit before fetch", async () => {
    const fetchMock = install([]);

    await expect(
      openaiAdapter.submit({
        built: [
          {
            body: { messages: [], model: "gpt-4o-mini", prompt: "too large" },
            customId: "a",
            endpoint: "/v1/chat/completions",
          },
        ],
        credentials,
        endpoint: "/v1/chat/completions",
        limits: { maxUploadBytes: 8 },
        modelId: "gpt-4o-mini",
      })
    ).rejects.toThrow("batch upload JSONL");
    expect(fetchMock.mock.calls).toHaveLength(0);
  });

  it("rejects direct file upload redirects without following them", async () => {
    const redirectedUrl = "https://127.0.0.1/internal-upload";
    const requestedUrls: string[] = [];
    const fetchMock = mock(
      (
        input: string | URL | Request,
        init?: RequestInit
      ): Promise<Response> => {
        const url = typeof input === "string" ? input : String(input);
        requestedUrls.push(url);
        if (url.endsWith("/files")) {
          if (init?.redirect === "manual") {
            return Promise.resolve(
              new Response("redirect", {
                headers: { location: redirectedUrl },
                status: 307,
              })
            );
          }
          requestedUrls.push(redirectedUrl);
          return Promise.resolve(Response.json({ id: "file-in" }));
        }
        if (url.endsWith("/batches")) {
          return Promise.resolve(Response.json({ id: "batch_1" }));
        }
        return Promise.reject(new Error(`unexpected ${url}`));
      }
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await expect(
      openaiAdapter.submit({
        built: [
          {
            body: { messages: [], model: "gpt-4o-mini" },
            customId: "a",
            endpoint: "/v1/chat/completions",
          },
        ],
        credentials,
        endpoint: "/v1/chat/completions",
        modelId: "gpt-4o-mini",
      })
    ).rejects.toThrow("POST https://api.openai.com/v1/files failed with 307");

    const upload = fetchMock.mock.calls.find((call) =>
      String(call[0]).endsWith("/files")
    );
    if (!upload) {
      throw new Error("expected file upload request");
    }
    expect((upload[1] as RequestInit).redirect).toBe("manual");
    expect(requestedUrls).not.toContain(redirectedUrl);
    expect(
      fetchMock.mock.calls.some((call) => String(call[0]).endsWith("/batches"))
    ).toBe(false);
  });

  it("streams output and error files into normalized results", async () => {
    const output =
      '{"custom_id":"a","response":{"status_code":200,"body":{"choices":[{"message":{"content":"Hi"}}],"usage":{"prompt_tokens":5,"completion_tokens":2,"total_tokens":7}}},"error":null}';
    const errors =
      '{"custom_id":"b","response":null,"error":{"message":"bad model","type":"invalid_request_error","code":"model_not_found"}}';

    install([
      {
        body: {
          error_file_id: "file-err",
          id: "batch_1",
          output_file_id: "file-out",
          request_counts: { completed: 1, failed: 1, total: 2 },
          status: "completed",
        },
        match: (url, method) =>
          url.includes("/batches/batch_1") && method === "GET",
      },
      { body: output, match: (url) => url.includes("/files/file-out/content") },
      { body: errors, match: (url) => url.includes("/files/file-err/content") },
    ]);

    const out = await collect(openaiAdapter.results("batch_1", credentials));
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      customId: "a",
      status: "succeeded",
      text: "Hi",
    });
    expect(out[0]?.usage).toStrictEqual({
      inputTokens: 5,
      outputTokens: 2,
      totalTokens: 7,
    });
    expect(out[1]).toMatchObject({ customId: "b", status: "errored" });
    expect(out[1]?.error?.message).toBe("bad model");
  });
});

describe("groq adapter", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("normalizes the captured endpoint for the line url and batch", async () => {
    const fetchMock = install([
      {
        body: { id: "file-in" },
        match: (url, method) => url.endsWith("/files") && method === "POST",
      },
      {
        body: {
          id: "batch_g",
          request_counts: { completed: 0, failed: 0, total: 1 },
          status: "validating",
        },
        match: (url, method) => url.endsWith("/batches") && method === "POST",
      },
    ]);

    const snapshot = await groqAdapter.submit({
      built: [
        {
          body: { messages: [], model: "llama" },
          customId: "a",
          // Groq is served under /openai/v1; this must be normalized.
          endpoint: "/openai/v1/chat/completions",
        },
      ],
      credentials,
      endpoint: "/openai/v1/chat/completions",
      modelId: "llama",
    });

    expect(snapshot.id).toBe("batch_g");
    expect(snapshot.provider).toBe("groq");

    const lines = await uploadedJsonl(fetchMock.mock.calls[0]);
    expect(lines[0]?.url).toBe("/v1/chat/completions");
    expect(lines[0]?.method).toBe("POST");
    const createBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(createBody.endpoint).toBe("/v1/chat/completions");
  });
});

describe("together adapter", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const submitOneLine = () =>
    togetherAdapter.submit({
      built: [
        {
          body: { messages: [], model: "meta-llama" },
          customId: "a",
          endpoint: "/v1/chat/completions",
        },
      ],
      credentials,
      endpoint: "/v1/chat/completions",
      modelId: "meta-llama",
    });

  it("uploads via the presigned-URL flow and sets the endpoint on the batch", async () => {
    const storageUrl = "https://storage.example/presigned-put";
    const fetchMock = install([
      // 1. Init: JSON metadata POST -> 302 with Location + file id.
      {
        body: "",
        headers: { Location: storageUrl, "X-Together-File-Id": "file-in" },
        match: (url, method) => url.endsWith("/files") && method === "POST",
        status: 302,
      },
      // 2. Upload the bytes to the presigned URL.
      {
        body: "",
        match: (url, method) => url === storageUrl && method === "PUT",
      },
      // 3. Finalize.
      {
        body: { id: "file-in" },
        match: (url, method) =>
          url.endsWith("/files/file-in/preprocess") && method === "POST",
      },
      {
        body: {
          job: {
            id: "batch_t",
            request_counts: { completed: 0, failed: 0, total: 1 },
            status: "VALIDATING",
          },
        },
        match: (url, method) => url.endsWith("/batches") && method === "POST",
      },
    ]);

    const snapshot = await submitOneLine();

    expect(snapshot.provider).toBe("together");
    expect(snapshot.id).toBe("batch_t");
    expect(snapshot.status).toBe("validating");

    // Step 1: multipart metadata only (purpose + file_name + file_type, no
    // file part — the bytes go via the presigned PUT), redirect not followed.
    expect(fetchMock.mock.calls[0]?.[1]?.redirect).toBe("manual");
    const initForm = uploadedForm(fetchMock.mock.calls[0]);
    expect(initForm.get("purpose")).toBe("batch-api");
    expect(initForm.get("file_name")).toBe("batchwork.jsonl");
    expect(initForm.get("file_type")).toBe("jsonl");
    expect(initForm.get("file")).toBeNull();

    // Step 2: bytes PUT to the presigned URL, with no Together auth header.
    expect(fetchMock.mock.calls[1]?.[0]).toBe(storageUrl);
    const putHeaders = new Headers(fetchMock.mock.calls[1]?.[1]?.headers);
    expect(putHeaders.has("authorization")).toBe(false);
    const lines = String(fetchMock.mock.calls[1]?.[1]?.body)
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    // body-only: no method/url, just custom_id + body.
    expect(lines[0]?.method).toBeUndefined();
    expect(lines[0]?.url).toBeUndefined();
    expect(lines[0]?.custom_id).toBe("a");

    // Step 4 (after preprocess): the batch references the uploaded file id.
    const createBody = JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body));
    expect(createBody.input_file_id).toBe("file-in");
    expect(createBody.endpoint).toBe("/v1/chat/completions");
  });

  it("throws when the presigned upload cannot be initiated", async () => {
    // A non-302 from the init POST means no presigned URL was issued.
    install([
      {
        body: "service unavailable",
        match: (url, method) => url.endsWith("/files") && method === "POST",
        status: 503,
      },
    ]);

    await expect(submitOneLine()).rejects.toThrow(
      "Together upload could not be initiated (503)."
    );
  });

  it("throws when the init redirect omits the file id", async () => {
    install([
      {
        body: "",
        // A 302 with a Location but no X-Together-File-Id is unusable.
        headers: { Location: "https://storage.example/presigned-put" },
        match: (url, method) => url.endsWith("/files") && method === "POST",
        status: 302,
      },
    ]);

    await expect(submitOneLine()).rejects.toThrow(
      "Together upload could not be initiated (302)"
    );
  });

  it("rejects unsafe presigned upload locations before PUT", async () => {
    const fetchMock = install([
      {
        body: "",
        headers: {
          Location: "https://127.0.0.1/presigned-put",
          "X-Together-File-Id": "file-in",
        },
        match: (url, method) => url.endsWith("/files") && method === "POST",
        status: 302,
      },
    ]);

    await expect(submitOneLine()).rejects.toThrow("private networks");
    expect(fetchMock.mock.calls).toHaveLength(1);
  });

  it("rejects unsafe Together file ids before preprocess", async () => {
    const storageUrl = "https://storage.example/presigned-put";
    const fetchMock = install([
      {
        body: "",
        headers: { Location: storageUrl, "X-Together-File-Id": "../secret" },
        match: (url, method) => url.endsWith("/files") && method === "POST",
        status: 302,
      },
      {
        body: "",
        match: (url, method) => url === storageUrl && method === "PUT",
      },
    ]);

    await expect(submitOneLine()).rejects.toThrow("invalid Together file id");
    expect(fetchMock.mock.calls).toHaveLength(2);
  });

  it("throws when the presigned PUT upload fails", async () => {
    const storageUrl = "https://storage.example/presigned-put";
    install([
      {
        body: "",
        headers: { Location: storageUrl, "X-Together-File-Id": "file-in" },
        match: (url, method) => url.endsWith("/files") && method === "POST",
        status: 302,
      },
      {
        body: "access denied",
        match: (url, method) => url === storageUrl && method === "PUT",
        status: 403,
      },
    ]);

    await expect(submitOneLine()).rejects.toThrow(
      "Together file upload failed (403)."
    );
  });

  it("rejects presigned PUT redirects without following them", async () => {
    const storageUrl = "https://storage.example/presigned-put";
    const redirectedUrl = "https://127.0.0.1/internal-upload";
    const requestedUrls: string[] = [];
    const fetchMock = mock(
      (
        input: string | URL | Request,
        init?: RequestInit
      ): Promise<Response> => {
        const url = typeof input === "string" ? input : String(input);
        requestedUrls.push(url);
        if (url.endsWith("/files") && init?.method === "POST") {
          return Promise.resolve(
            new Response("", {
              headers: {
                Location: storageUrl,
                "X-Together-File-Id": "file-in",
              },
              status: 302,
            })
          );
        }
        if (url === storageUrl && init?.method === "PUT") {
          if (init.redirect === "manual") {
            return Promise.resolve(
              new Response("redirect", {
                headers: { location: redirectedUrl },
                status: 307,
              })
            );
          }
          requestedUrls.push(redirectedUrl);
          return Promise.resolve(new Response("", { status: 200 }));
        }
        if (url.endsWith("/files/file-in/preprocess")) {
          return Promise.resolve(Response.json({ id: "file-in" }));
        }
        return Promise.reject(new Error(`unexpected ${url}`));
      }
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await expect(submitOneLine()).rejects.toThrow(
      "Together file upload failed (307)."
    );

    const upload = fetchMock.mock.calls.find((call) => call[0] === storageUrl);
    if (!upload) {
      throw new Error("expected presigned PUT request");
    }
    expect((upload[1] as RequestInit).redirect).toBe("manual");
    expect(requestedUrls).not.toContain(redirectedUrl);
    expect(
      fetchMock.mock.calls.some((call) =>
        String(call[0]).endsWith("/files/file-in/preprocess")
      )
    ).toBe(false);
  });

  it("does not read failed init response bodies", async () => {
    let read = false;
    const unreadable = new Response("", { status: 500 });
    Object.defineProperty(unreadable, "text", {
      value: () => {
        read = true;
        return Promise.resolve("secret init body");
      },
    });
    const fetchMock = mock(() => Promise.resolve(unreadable));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await expect(submitOneLine()).rejects.toThrow(
      "Together upload could not be initiated (500)."
    );
    expect(read).toBe(false);
  });
});

describe("mistral adapter", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sets the model on the job and strips it from each line", async () => {
    const fetchMock = install([
      {
        body: { id: "file-in" },
        match: (url, method) => url.endsWith("/files") && method === "POST",
      },
      {
        body: {
          id: "job_1",
          status: "QUEUED",
          total_requests: 1,
        },
        match: (url, method) =>
          url.endsWith("/batch/jobs") && method === "POST",
      },
    ]);

    const snapshot = await mistralAdapter.submit({
      built: [
        {
          body: { messages: [], model: "mistral-small" },
          customId: "a",
          endpoint: "/v1/chat/completions",
        },
      ],
      credentials,
      endpoint: "/v1/chat/completions",
      modelId: "mistral-small-latest",
    });

    expect(snapshot.provider).toBe("mistral");
    expect(snapshot.status).toBe("validating");

    const lines = await uploadedJsonl(fetchMock.mock.calls[0]);
    const lineBody = lines[0]?.body as Record<string, unknown>;
    expect(lines[0]?.custom_id).toBe("a");
    expect(lineBody.model).toBeUndefined();
    const createBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(createBody.model).toBe("mistral-small-latest");
    expect(createBody.endpoint).toBe("/v1/chat/completions");
    expect(createBody.input_files).toStrictEqual(["file-in"]);
    expect(createBody.timeout_hours).toBeUndefined();
  });

  it("downloads the OpenAI-shaped output and error files", async () => {
    const output =
      '{"custom_id":"a","response":{"status_code":200,"body":{"choices":[{"message":{"content":"Bonjour"}}],"usage":{"prompt_tokens":3,"completion_tokens":1,"total_tokens":4}}},"error":null}';
    const errors =
      '{"custom_id":"b","response":null,"error":{"message":"bad request","type":"invalid_request"}}';

    install([
      {
        body: {
          error_file: "file-err",
          failed_requests: 1,
          id: "job_1",
          output_file: "file-out",
          status: "SUCCESS",
          succeeded_requests: 1,
          total_requests: 2,
        },
        match: (url, method) =>
          url.endsWith("/batch/jobs/job_1") && method === "GET",
      },
      { body: output, match: (url) => url.includes("/files/file-out/content") },
      { body: errors, match: (url) => url.includes("/files/file-err/content") },
    ]);

    const out = await collect(mistralAdapter.results("job_1", credentials));
    expect(out[0]).toMatchObject({
      customId: "a",
      status: "succeeded",
      text: "Bonjour",
    });
    expect(out[1]).toMatchObject({ customId: "b", status: "errored" });
    expect(out[1]?.error?.message).toBe("bad request");
  });
});

describe("google adapter", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("submits inline requests keyed by metadata.key", async () => {
    const fetchMock = install([
      {
        body: { metadata: { state: "JOB_STATE_PENDING" }, name: "batches/1" },
        match: (url, method) =>
          url.endsWith(":batchGenerateContent") && method === "POST",
      },
    ]);

    const snapshot = await googleAdapter.submit({
      built: [
        {
          body: { contents: [{ parts: [{ text: "Hi" }] }] },
          customId: "a",
          endpoint: "/v1beta/models/gemini-2.5-flash:generateContent",
        },
      ],
      credentials,
      endpoint: "/v1beta/models/gemini-2.5-flash:generateContent",
      modelId: "gemini-2.5-flash",
    });

    expect(snapshot.id).toBe("batches/1");
    expect(snapshot.provider).toBe("google");
    expect(snapshot.status).toBe("validating");

    const sentBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const { requests } = sentBody.batch.input_config.requests;
    expect(requests[0].metadata.key).toBe("a");
    expect(requests[0].request.contents[0].parts[0].text).toBe("Hi");
  });

  it("parses inline responses keyed back by metadata.key", async () => {
    install([
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
                    candidates: [{ content: { parts: [{ text: "Hello" }] } }],
                    usageMetadata: {
                      candidatesTokenCount: 2,
                      promptTokenCount: 5,
                      totalTokenCount: 7,
                    },
                  },
                },
                {
                  error: {
                    code: 3,
                    message: "bad",
                    status: "INVALID_ARGUMENT",
                  },
                  metadata: { key: "b" },
                },
              ],
            },
          },
        },
        match: (url, method) => url.endsWith("/batches/1") && method === "GET",
      },
    ]);

    const out = await collect(googleAdapter.results("batches/1", credentials));
    expect(out[0]).toMatchObject({
      customId: "a",
      status: "succeeded",
      text: "Hello",
    });
    expect(out[0]?.usage).toStrictEqual({
      inputTokens: 5,
      outputTokens: 2,
      totalTokens: 7,
    });
    expect(out[1]).toMatchObject({ customId: "b", status: "errored" });
    expect(out[1]?.error?.message).toBe("bad");
  });
});

describe("xai adapter", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("uploads a file and creates a batch by input_file_id", async () => {
    const fetchMock = install([
      {
        body: { id: "file-in" },
        match: (url, method) => url.endsWith("/files") && method === "POST",
      },
      {
        body: {
          batch_id: "b_x",
          state: {
            num_cancelled: 0,
            num_error: 0,
            num_pending: 1,
            num_requests: 1,
            num_success: 0,
          },
        },
        match: (url, method) => url.endsWith("/batches") && method === "POST",
      },
    ]);

    const snapshot = await xaiAdapter.submit({
      built: [
        {
          body: { messages: [], model: "grok-4" },
          customId: "a",
          endpoint: "/v1/chat/completions",
        },
      ],
      credentials,
      endpoint: "/v1/chat/completions",
      modelId: "grok-4",
    });

    expect(snapshot.id).toBe("b_x");
    expect(snapshot.provider).toBe("xai");
    expect(snapshot.status).toBe("in_progress");
    expect(uploadedForm(fetchMock.mock.calls[0]).has("purpose")).toBe(false);
    const lines = await uploadedJsonl(fetchMock.mock.calls[0]);
    expect(lines[0]?.url).toBe("/v1/chat/completions");
    expect(lines[0]?.method).toBe("POST");
    const createBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(createBody.input_file_id).toBe("file-in");
  });

  it("paginates results and parses chat_get_completion", async () => {
    install([
      {
        body: {
          pagination_token: null,
          results: [
            {
              batch_request_id: "a",
              batch_result: {
                response: {
                  chat_get_completion: {
                    choices: [{ message: { content: "Hi" } }],
                    usage: {
                      completion_tokens: 2,
                      prompt_tokens: 5,
                      total_tokens: 7,
                    },
                  },
                },
              },
            },
            { batch_request_id: "b", error_message: "rate limited" },
          ],
        },
        match: (url) => url.includes("/batches/b_x/results"),
      },
    ]);

    const out = await collect(xaiAdapter.results("b_x", credentials));
    expect(out[0]).toMatchObject({
      customId: "a",
      status: "succeeded",
      text: "Hi",
    });
    expect(out[0]?.usage).toStrictEqual({
      inputTokens: 5,
      outputTokens: 2,
      totalTokens: 7,
    });
    expect(out[1]).toMatchObject({ customId: "b", status: "errored" });
    expect(out[1]?.error?.message).toBe("rate limited");
  });
});
