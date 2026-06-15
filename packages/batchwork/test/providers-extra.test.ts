import { afterEach, describe, expect, it, mock } from "bun:test";

import type { BatchAdapter } from "../src/providers/adapter";
import { anthropicAdapter } from "../src/providers/anthropic";
import { googleAdapter } from "../src/providers/google";
import { mistralAdapter } from "../src/providers/mistral";
import { openaiAdapter } from "../src/providers/openai";
import {
  normalizeOpenAIResult,
  resolveApiKey,
  textFromBody,
  usageFromBody,
} from "../src/providers/shared";
import { togetherAdapter } from "../src/providers/together";
import { xaiAdapter } from "../src/providers/xai";
import type { BatchResult, BatchStatus } from "../src/types";

const credentials = { apiKey: "test-key" };

interface Route {
  body: unknown;
  status?: number;
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
      return Promise.resolve(
        new Response(payload, { status: route.status ?? 200 })
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

/** Install a single GET route and retrieve a snapshot from it. */
const retrieveRaw = (adapter: BatchAdapter, raw: unknown, id = "b1") => {
  install([{ body: raw, match: (_url, method) => method === "GET" }]);
  return adapter.retrieve(id, credentials);
};

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("shared helpers", () => {
  it("resolveApiKey reads credentials, env, then throws", () => {
    expect(resolveApiKey({ apiKey: "k" }, "UNSET_VAR_X", "OpenAI")).toBe("k");
    expect(() => resolveApiKey({}, "UNSET_VAR_X", "OpenAI")).toThrow(
      "missing OpenAI API key"
    );
  });

  it("textFromBody prefers chat content, then output_text", () => {
    expect(textFromBody({ choices: [{ message: { content: "hi" } }] })).toBe(
      "hi"
    );
    // No usable choice content falls through to the responses-style field.
    expect(
      textFromBody({ choices: [{ message: {} }], output_text: "ot" })
    ).toBe("ot");
    expect(textFromBody({ output_text: "only" })).toBe("only");
    expect(textFromBody({})).toBeUndefined();
  });

  it("usageFromBody handles both token spellings and absence", () => {
    expect(
      usageFromBody({ usage: { input_tokens: 3, output_tokens: 4 } })
    ).toEqual({ inputTokens: 3, outputTokens: 4, totalTokens: 7 });
    expect(usageFromBody({ usage: {} })).toBeUndefined();
    expect(usageFromBody({})).toBeUndefined();
  });

  it("normalizeOpenAIResult handles success, top-level error, and HTTP error", () => {
    const ok = normalizeOpenAIResult({
      custom_id: "a",
      response: {
        body: { choices: [{ message: { content: "hi" } }] },
        status_code: 200,
      },
    });
    expect(ok).toMatchObject({
      customId: "a",
      status: "succeeded",
      text: "hi",
    });

    const topError = normalizeOpenAIResult({
      custom_id: "b",
      error: { code: "bad", message: "nope", type: "invalid_request_error" },
    });
    expect(topError).toMatchObject({ customId: "b", status: "errored" });
    expect(topError.error).toEqual({
      code: "bad",
      message: "nope",
      type: "invalid_request_error",
    });

    const httpError = normalizeOpenAIResult({
      custom_id: "c",
      response: { body: { error: { message: "boom" } }, status_code: 400 },
    });
    expect(httpError).toMatchObject({ customId: "c", status: "errored" });
    expect(httpError.error?.message).toBe("boom");

    // A non-2xx with no error body falls back to a synthesized message.
    const bare = normalizeOpenAIResult({
      custom_id: "d",
      response: { body: {}, status_code: 500 },
    });
    expect(bare.error?.message).toContain("status 500");
  });
});

describe("openai-compatible branches", () => {
  it("unwraps Together job wrappers and lowercases uppercase statuses", async () => {
    const snapshot = await retrieveRaw(togetherAdapter, {
      job: {
        id: "batch_t",
        request_counts: { completed: 1, failed: 0, total: 1 },
        status: "COMPLETED",
      },
    });
    expect(snapshot.id).toBe("batch_t");
    expect(snapshot.status).toBe("completed");
    expect(snapshot.raw).toMatchObject({ id: "batch_t" });
  });

  it("maps an unknown status to in_progress", async () => {
    const snapshot = await retrieveRaw(openaiAdapter, {
      id: "b",
      request_counts: { completed: 0, failed: 0, total: 1 },
      status: "something_new",
    });
    expect(snapshot.status).toBe("in_progress");
  });

  it("normalizes completion timestamps", async () => {
    const snapshot = await retrieveRaw(openaiAdapter, {
      completed_at: 1_719_254_400,
      created_at: 1_719_168_000,
      expires_at: 1_719_254_400,
      id: "b",
      request_counts: { completed: 1, failed: 0, total: 1 },
      status: "completed",
    });
    expect(snapshot.completedAt).toBeInstanceOf(Date);
    expect(snapshot.createdAt).toBeInstanceOf(Date);
  });

  it("throws when results are not ready", async () => {
    install([
      {
        body: {
          id: "b",
          request_counts: { completed: 0, failed: 0, total: 1 },
          status: "in_progress",
        },
        match: (_url, method) => method === "GET",
      },
    ]);
    await expect(
      collect(openaiAdapter.results("b", credentials))
    ).rejects.toThrow("results are not ready");
  });

  it("rejects unsafe batch ids before OpenAI-compatible requests", async () => {
    const fetchMock = install([]);
    await expect(
      openaiAdapter.cancel("../models", credentials)
    ).rejects.toThrow("invalid openai batch id");
    expect(fetchMock.mock.calls).toHaveLength(0);
  });

  it("rejects unsafe OpenAI-compatible result file ids before download", async () => {
    const fetchMock = install([
      {
        body: {
          id: "batch_1",
          output_file_id: "../secret",
          request_counts: { completed: 1, failed: 0, total: 1 },
          status: "completed",
        },
        match: (url, method) =>
          url.endsWith("/batches/batch_1") && method === "GET",
      },
    ]);

    await expect(
      collect(openaiAdapter.results("batch_1", credentials))
    ).rejects.toThrow("invalid openai output file id");
    expect(fetchMock.mock.calls).toHaveLength(1);
  });

  it("cancels a batch", async () => {
    const fetchMock = install([
      {
        body: { id: "b", status: "cancelling" },
        match: (url, method) => url.endsWith("/cancel") && method === "POST",
      },
    ]);
    await openaiAdapter.cancel("b", credentials);
    expect(
      fetchMock.mock.calls.some((call) =>
        String(call[0]).endsWith("/batches/b/cancel")
      )
    ).toBe(true);
  });
});

describe("xai branches", () => {
  it("derives in_progress when no counts are present", async () => {
    const snapshot = await retrieveRaw(xaiAdapter, {
      batch_id: "b",
      state: {},
    });
    expect(snapshot.status).toBe("in_progress");
  });

  it("keeps empty xAI batches in progress", async () => {
    const snapshot = await retrieveRaw(xaiAdapter, {
      batch_id: "b",
      state: { num_pending: 0, num_requests: 0 },
    });
    expect(snapshot.status).toBe("in_progress");
  });

  it("derives cancelled when all requests were cancelled", async () => {
    const snapshot = await retrieveRaw(xaiAdapter, {
      batch_id: "b",
      state: { num_cancelled: 2, num_pending: 0, num_requests: 2 },
    });
    expect(snapshot.status).toBe("cancelled");
  });

  it("derives completed and falls back to obj.id", async () => {
    const snapshot = await retrieveRaw(xaiAdapter, {
      id: "fallback",
      state: {
        num_cancelled: 0,
        num_pending: 0,
        num_requests: 1,
        num_success: 1,
      },
    });
    expect(snapshot.id).toBe("fallback");
    expect(snapshot.status).toBe("completed");
  });

  it("paginates results across pages", async () => {
    const page1 = {
      pagination_token: "t1",
      results: [
        {
          batch_request_id: "a",
          batch_result: {
            response: {
              chat_get_completion: {
                choices: [{ message: { content: "one" } }],
              },
            },
          },
        },
      ],
    };
    const page2 = {
      pagination_token: null,
      results: [{ batch_request_id: "b", error_message: "boom" }],
    };
    install([
      { body: page2, match: (url) => url.includes("pagination_token=t1") },
      { body: page1, match: (url) => url.includes("/results") },
    ]);

    const out = await collect(xaiAdapter.results("b_x", credentials));
    expect(out.map((item) => item.customId)).toEqual(["a", "b"]);
    expect(out[1]).toMatchObject({ status: "errored" });
  });

  it("falls back to the first response op type for non-chat completions", async () => {
    install([
      {
        body: {
          pagination_token: null,
          results: [
            {
              batch_request_id: "a",
              batch_result: {
                response: { some_other_op: { output_text: "yo" } },
              },
            },
          ],
        },
        match: (url) => url.includes("/results"),
      },
    ]);
    const out = await collect(xaiAdapter.results("b_x", credentials));
    expect(out[0]?.text).toBe("yo");
  });

  it("normalizes xAI batch_result error payloads", async () => {
    install([
      {
        body: {
          pagination_token: null,
          results: [
            {
              batch_request_id: "a",
              batch_result: {
                error: {
                  message: "bad request",
                  type: "invalid_request_error",
                },
              },
            },
            {
              batch_request_id: "b",
              batch_result: { error: "rate limited" },
            },
          ],
        },
        match: (url) => url.includes("/results"),
      },
    ]);

    const out = await collect(xaiAdapter.results("b_x", credentials));
    expect(out[0]).toMatchObject({
      customId: "a",
      error: { message: "bad request", type: "invalid_request_error" },
      status: "errored",
    });
    expect(out[1]).toMatchObject({
      customId: "b",
      error: { message: "rate limited" },
      status: "errored",
    });
  });

  it("cancels a batch", async () => {
    const fetchMock = install([
      {
        body: {},
        match: (url, method) => url.endsWith(":cancel") && method === "POST",
      },
    ]);
    await xaiAdapter.cancel("b_x", credentials);
    expect(
      fetchMock.mock.calls.some((call) =>
        String(call[0]).endsWith("/batches/b_x:cancel")
      )
    ).toBe(true);
  });
});

describe("anthropic branches", () => {
  it("maps the canceling status", async () => {
    const snapshot = await retrieveRaw(anthropicAdapter, {
      id: "b",
      processing_status: "canceling",
      request_counts: {
        canceled: 0,
        errored: 0,
        expired: 0,
        processing: 1,
        succeeded: 0,
      },
    });
    expect(snapshot.status).toBe("cancelling");
  });

  it("succeeds without usage and with empty text", async () => {
    const jsonl = [
      '{"custom_id":"a","result":{"type":"succeeded","message":{"content":[{"type":"text","text":"Hi"}]}}}',
      '{"custom_id":"b","result":{"type":"succeeded","message":{"content":[]}}}',
    ].join("\n");
    install([
      {
        body: {
          id: "b1",
          processing_status: "ended",
          results_url:
            "https://api.anthropic.com/v1/messages/batches/b1/results",
        },
        match: (url, method) => url.endsWith("/b1") && method === "GET",
      },
      { body: jsonl, match: (url) => url.endsWith("/results") },
    ]);

    const out = await collect(anthropicAdapter.results("b1", credentials));
    expect(out[0]).toMatchObject({ status: "succeeded", text: "Hi" });
    expect(out[0]?.usage).toBeUndefined();
    expect(out[1]?.text).toBeUndefined();
  });

  it("normalizes direct Anthropic error payloads", async () => {
    install([
      {
        body: {
          id: "b1",
          processing_status: "ended",
          results_url:
            "https://api.anthropic.com/v1/messages/batches/b1/results",
        },
        match: (url, method) => url.endsWith("/b1") && method === "GET",
      },
      {
        body: [
          '{"custom_id":"a","result":{"type":"errored","error":{"type":"invalid_request_error","message":"bad direct"}}}',
        ].join("\n"),
        match: (url) => url.endsWith("/results"),
      },
    ]);

    const out = await collect(anthropicAdapter.results("b1", credentials));
    expect(out[0]).toMatchObject({
      customId: "a",
      error: { message: "bad direct", type: "invalid_request_error" },
      status: "errored",
    });
  });

  it("rejects cross-origin Anthropic result URLs before sending auth headers", async () => {
    const fetchMock = install([
      {
        body: {
          id: "b1",
          processing_status: "ended",
          results_url: "https://attacker.example/results.jsonl",
        },
        match: (url, method) => url.endsWith("/b1") && method === "GET",
      },
    ]);

    await expect(
      collect(anthropicAdapter.results("b1", credentials))
    ).rejects.toThrow("must match the configured API origin");
    expect(
      fetchMock.mock.calls.some((call) =>
        String(call[0]).includes("attacker.example")
      )
    ).toBe(false);
  });

  it("throws when results are not ready", async () => {
    install([
      {
        body: { id: "b", processing_status: "in_progress", results_url: null },
        match: (_url, method) => method === "GET",
      },
    ]);
    await expect(
      collect(anthropicAdapter.results("b", credentials))
    ).rejects.toThrow("results are not ready");
  });

  it("rejects unsafe Anthropic batch ids before requests", async () => {
    const fetchMock = install([]);
    await expect(
      anthropicAdapter.cancel("../messages", credentials)
    ).rejects.toThrow("invalid Anthropic batch id");
    expect(fetchMock.mock.calls).toHaveLength(0);
  });

  it("cancels a batch", async () => {
    const fetchMock = install([
      {
        body: {},
        match: (url, method) => url.endsWith("/cancel") && method === "POST",
      },
    ]);
    await anthropicAdapter.cancel("b", credentials);
    expect(
      fetchMock.mock.calls.some((call) =>
        String(call[0]).endsWith("/v1/messages/batches/b/cancel")
      )
    ).toBe(true);
  });

  it("throws when the Anthropic key is missing", async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      await expect(anthropicAdapter.retrieve("b", {})).rejects.toThrow(
        "missing Anthropic API key"
      );
    } finally {
      if (saved !== undefined) {
        process.env.ANTHROPIC_API_KEY = saved;
      }
    }
  });
});

describe("google branches", () => {
  const states: [string, BatchStatus][] = [
    ["JOB_STATE_FAILED", "failed"],
    ["JOB_STATE_CANCELLED", "cancelled"],
    ["JOB_STATE_EXPIRED", "expired"],
    ["JOB_STATE_PENDING", "validating"],
    ["JOB_STATE_RUNNING", "in_progress"],
  ];

  it("maps each Gemini job state", async () => {
    for (const [state, expected] of states) {
      // oxlint-disable-next-line no-await-in-loop -- exercising each state.
      const snapshot = await retrieveRaw(
        googleAdapter,
        { metadata: { state }, name: "batches/1" },
        "batches/1"
      );
      expect(snapshot.status).toBe(expected);
    }
  });

  it("falls back to done when no state is present", async () => {
    const finished = await retrieveRaw(
      googleAdapter,
      { done: true, name: "batches/1" },
      "batches/1"
    );
    expect(finished.status).toBe("completed");
    const running = await retrieveRaw(
      googleAdapter,
      { name: "batches/1" },
      "batches/1"
    );
    expect(running.status).toBe("in_progress");
  });

  it("falls back to done for an unrecognized state string", async () => {
    const finished = await retrieveRaw(
      googleAdapter,
      {
        done: true,
        metadata: { state: "JOB_STATE_UNSPECIFIED" },
        name: "batches/1",
      },
      "batches/1"
    );
    expect(finished.status).toBe("completed");
  });

  it("reads top-level Gemini state fields", async () => {
    const direct = await retrieveRaw(
      googleAdapter,
      { name: "batches/1", state: "JOB_STATE_SUCCEEDED" },
      "batches/1"
    );
    expect(direct.status).toBe("completed");

    const named = await retrieveRaw(
      googleAdapter,
      { name: "batches/1", state: { name: "JOB_STATE_RUNNING" } },
      "batches/1"
    );
    expect(named.status).toBe("in_progress");
  });

  it("succeeds without usage metadata", async () => {
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
                    candidates: [{ content: { parts: [{ text: "Hi" }] } }],
                  },
                },
              ],
            },
          },
        },
        match: (_url, method) => method === "GET",
      },
    ]);
    const out = await collect(googleAdapter.results("batches/1", credentials));
    expect(out[0]).toMatchObject({ status: "succeeded", text: "Hi" });
    expect(out[0]?.usage).toBeUndefined();
  });

  it("parses Gemini dest inline responses", async () => {
    install([
      {
        body: {
          dest: {
            inlinedResponses: [
              {
                key: "a",
                response: {
                  candidates: [{ content: { parts: [{ text: "Yo" }] } }],
                },
              },
            ],
          },
          name: "batches/1",
          state: "JOB_STATE_SUCCEEDED",
        },
        match: (_url, method) => method === "GET",
      },
    ]);
    const out = await collect(googleAdapter.results("batches/1", credentials));
    expect(out[0]).toMatchObject({
      customId: "a",
      status: "succeeded",
      text: "Yo",
    });
  });

  it("throws for file-mode results", async () => {
    install([
      {
        body: {
          metadata: { state: "JOB_STATE_SUCCEEDED" },
          name: "batches/1",
          response: { responsesFile: { name: "files/out" } },
        },
        match: (_url, method) => method === "GET",
      },
    ]);
    await expect(
      collect(googleAdapter.results("batches/1", credentials))
    ).rejects.toThrow("file-mode results");
  });

  it("throws for Gemini dest file-mode results", async () => {
    install([
      {
        body: {
          dest: { fileName: "files/out" },
          name: "batches/1",
          state: "JOB_STATE_SUCCEEDED",
        },
        match: (_url, method) => method === "GET",
      },
    ]);
    await expect(
      collect(googleAdapter.results("batches/1", credentials))
    ).rejects.toThrow("file-mode results");
  });

  it("throws when results are not ready", async () => {
    install([
      {
        body: { metadata: { state: "JOB_STATE_RUNNING" }, name: "batches/1" },
        match: (_url, method) => method === "GET",
      },
    ]);
    await expect(
      collect(googleAdapter.results("batches/1", credentials))
    ).rejects.toThrow("results are not ready");
  });

  it("cancels a batch", async () => {
    const fetchMock = install([
      {
        body: {},
        match: (url, method) => url.endsWith(":cancel") && method === "POST",
      },
    ]);
    await googleAdapter.cancel("batches/1", credentials);
    expect(
      fetchMock.mock.calls.some((call) =>
        String(call[0]).endsWith("batches/1:cancel")
      )
    ).toBe(true);
  });

  it("throws when the Google key is missing", async () => {
    const savedGoogle = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const savedGemini = process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      await expect(googleAdapter.retrieve("batches/1", {})).rejects.toThrow(
        "missing Google Gemini API key"
      );
    } finally {
      if (savedGoogle !== undefined) {
        process.env.GOOGLE_GENERATIVE_AI_API_KEY = savedGoogle;
      }
      if (savedGemini !== undefined) {
        process.env.GEMINI_API_KEY = savedGemini;
      }
    }
  });
});

describe("mistral branches", () => {
  const statuses: [string, BatchStatus][] = [
    ["FAILED", "failed"],
    ["TIMEOUT_EXCEEDED", "expired"],
    ["CANCELLATION_REQUESTED", "cancelling"],
    ["CANCELLED", "cancelled"],
    ["SOMETHING_ELSE", "in_progress"],
  ];

  it("maps each Mistral job status", async () => {
    for (const [status, expected] of statuses) {
      // oxlint-disable-next-line no-await-in-loop -- exercising each status.
      const snapshot = await retrieveRaw(mistralAdapter, {
        id: "job_1",
        status,
        total_requests: 1,
      });
      expect(snapshot.status).toBe(expected);
    }
  });

  it("cancels a job", async () => {
    const fetchMock = install([
      {
        body: {},
        match: (url, method) => url.endsWith("/cancel") && method === "POST",
      },
    ]);
    await mistralAdapter.cancel("job_1", credentials);
    expect(
      fetchMock.mock.calls.some((call) =>
        String(call[0]).endsWith("/batch/jobs/job_1/cancel")
      )
    ).toBe(true);
  });

  it("throws when Mistral results are not ready", async () => {
    install([
      {
        body: {
          id: "job_1",
          status: "RUNNING",
          total_requests: 1,
        },
        match: (_url, method) => method === "GET",
      },
    ]);
    await expect(
      collect(mistralAdapter.results("job_1", credentials))
    ).rejects.toThrow("results are not ready");
  });
});
