import { afterEach, describe, expect, it, vi } from "vitest";

import { anthropicAdapter } from "../src/providers/anthropic";
import { openaiAdapter } from "../src/providers/openai";
import type { BatchResult } from "../src/types";

const credentials = { apiKey: "test-key" };

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

const collect = async (
  source: AsyncIterable<BatchResult>
): Promise<BatchResult[]> => {
  const out: BatchResult[] = [];
  for await (const item of source) {
    out.push(item);
  }
  return out;
};

describe("anthropic adapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("submits an inline request array and normalizes the snapshot", async () => {
    const mock = install([
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
    });

    expect(snapshot.id).toBe("msgbatch_1");
    expect(snapshot.status).toBe("in_progress");
    expect(snapshot.requestCounts.total).toBe(2);

    // `stream` is stripped and the request is sent inline (no file upload).
    const sentBody = JSON.parse(String(mock.mock.calls[0]?.[1]?.body));
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
    vi.unstubAllGlobals();
  });

  it("uploads a JSONL file then creates the batch", async () => {
    const mock = install([
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
    });

    expect(snapshot.id).toBe("batch_1");
    expect(snapshot.status).toBe("validating");
    // The create call references the uploaded file id.
    const createBody = JSON.parse(String(mock.mock.calls[1]?.[1]?.body));
    expect(createBody.input_file_id).toBe("file-in");
    expect(createBody.endpoint).toBe("/v1/chat/completions");
    expect(createBody.completion_window).toBe("24h");
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
