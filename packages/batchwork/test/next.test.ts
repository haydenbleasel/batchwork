import { afterEach, describe, expect, it, mock } from "bun:test";

import { createBatchRoutes, createMemoryStore } from "../src/next";
import type { BatchResult, BatchWebhookEvent } from "../src/next";
import { signWebhook } from "../src/server/signing";
import type { BatchProvider } from "../src/types";

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

const collect = async (
  results: AsyncIterable<BatchResult>
): Promise<BatchResult[]> => {
  const out: BatchResult[] = [];
  for await (const r of results) {
    out.push(r);
  }
  return out;
};

const completedBatch = (id: string) => ({
  id,
  output_file_id: "file-out",
  request_counts: { completed: 2, failed: 0, total: 2 },
  status: "completed",
});

const OUTPUT_LINES = [
  '{"custom_id":"a","response":{"status_code":200,"body":{"choices":[{"message":{"content":"Paris"}}]}}}',
  '{"custom_id":"b","response":{"status_code":200,"body":{"choices":[{"message":{"content":"Tokyo"}}]}}}',
].join("\n");

const retrieveRoute = (id: string, body: unknown): Route => ({
  body,
  match: (url, method) => url.includes(`/batches/${id}`) && method === "GET",
});

const outputRoute: Route = {
  body: OUTPUT_LINES,
  match: (url) => url.includes("/files/file-out/content"),
};

const CRON_URL = "https://app.test/api/batches/poll";

describe("createBatchRoutes — GET cron tick", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("invokes onComplete with the event and streamed results on completion", async () => {
    const store = createMemoryStore();
    const calls: { event: BatchWebhookEvent; results: BatchResult[] }[] = [];
    const { GET, track } = createBatchRoutes({
      credentials: { apiKey: "k" },
      onComplete: async (event, results) => {
        calls.push({ event, results: await collect(results) });
      },
      store,
    });
    await track({ id: "batch_1", provider: "openai" });
    install([retrieveRoute("batch_1", completedBatch("batch_1")), outputRoute]);

    const response = await GET(new Request(CRON_URL));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      checked: 1,
      delivered: ["batch_1"],
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.event).toMatchObject({
      id: "batch_1",
      provider: "openai",
      type: "batch.completed",
    });
    expect(calls[0]?.results.map((r) => r.customId)).toEqual(["a", "b"]);
    expect(calls[0]?.results.map((r) => r.text)).toEqual(["Paris", "Tokyo"]);

    const stored = await store.get("batch_1");
    expect(stored?.deliveredAt).toBeDefined();
  });

  it("resolves credentials from a per-provider function on completion", async () => {
    const store = createMemoryStore();
    const seen: BatchProvider[] = [];
    const calls: BatchResult[][] = [];
    const { GET, track } = createBatchRoutes({
      credentials: (provider) => {
        seen.push(provider);
        return { apiKey: `k-${provider}` };
      },
      onComplete: async (_event, results) => {
        calls.push(await collect(results));
      },
      store,
    });
    await track({ id: "batch_fn", provider: "openai" });
    install([
      retrieveRoute("batch_fn", completedBatch("batch_fn")),
      outputRoute,
    ]);

    const response = await GET(new Request(CRON_URL));
    expect(await response.json()).toMatchObject({ delivered: ["batch_fn"] });
    // The function resolver was consulted for the completed batch's provider.
    expect(seen).toContain("openai");
    expect(calls[0]?.map((r) => r.customId)).toEqual(["a", "b"]);
  });

  it("does not invoke onComplete while a batch is still in progress", async () => {
    const store = createMemoryStore();
    let called = false;
    const { GET, track } = createBatchRoutes({
      credentials: { apiKey: "k" },
      onComplete: () => {
        called = true;
      },
      store,
    });
    await track({ id: "batch_wip", provider: "openai" });
    install([
      retrieveRoute("batch_wip", {
        id: "batch_wip",
        request_counts: { completed: 0, failed: 0, total: 2 },
        status: "in_progress",
      }),
    ]);

    const response = await GET(new Request(CRON_URL));
    expect(await response.json()).toMatchObject({ delivered: [] });
    expect(called).toBe(false);
    const stored = await store.get("batch_wip");
    expect(stored?.deliveredAt).toBeUndefined();
  });

  it("invokes onComplete with empty results for a failed batch", async () => {
    const store = createMemoryStore();
    const calls: { event: BatchWebhookEvent; results: BatchResult[] }[] = [];
    const { GET, track } = createBatchRoutes({
      credentials: { apiKey: "k" },
      onComplete: async (event, results) => {
        calls.push({ event, results: await collect(results) });
      },
      store,
    });
    await track({ id: "batch_failed", provider: "openai" });
    // Terminal but no output/error file — streaming results would throw, so the
    // failure path must not fetch them.
    install([
      retrieveRoute("batch_failed", {
        id: "batch_failed",
        request_counts: { completed: 0, failed: 2, total: 2 },
        status: "failed",
      }),
    ]);

    const response = await GET(new Request(CRON_URL));
    expect(await response.json()).toMatchObject({
      delivered: ["batch_failed"],
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.event.type).toBe("batch.failed");
    expect(calls[0]?.results).toEqual([]);
    const stored = await store.get("batch_failed");
    expect(stored?.deliveredAt).toBeDefined();
  });

  it("keeps a batch pending and retries when onComplete throws", async () => {
    const store = createMemoryStore();
    const errors: string[] = [];
    let attempts = 0;
    const { GET, track } = createBatchRoutes({
      credentials: { apiKey: "k" },
      onComplete: () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("db down");
        }
      },
      onError: (record) => errors.push(record.id),
      store,
    });
    await track({ id: "batch_retry", provider: "openai" });
    install([
      retrieveRoute("batch_retry", completedBatch("batch_retry")),
      outputRoute,
    ]);

    // First tick: callback throws → reported as failed, not marked delivered.
    const first = await GET(new Request(CRON_URL));
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({
      delivered: [],
      failed: [{ error: "db down", id: "batch_retry" }],
    });
    expect(errors).toEqual(["batch_retry"]);
    const pending = await store.get("batch_retry");
    expect(pending?.deliveredAt).toBeUndefined();

    // Second tick: callback succeeds → delivered (proves at-least-once retry).
    const second = await GET(new Request(CRON_URL));
    expect(await second.json()).toMatchObject({ delivered: ["batch_retry"] });
    expect(attempts).toBe(2);
    const settled = await store.get("batch_retry");
    expect(settled?.deliveredAt).toBeDefined();
  });

  it("does not re-deliver an already-delivered batch on the next tick", async () => {
    const store = createMemoryStore();
    let calls = 0;
    const { GET, track } = createBatchRoutes({
      credentials: { apiKey: "k" },
      onComplete: () => {
        calls += 1;
      },
      store,
    });
    await track({ id: "batch_once", provider: "openai" });
    install([
      retrieveRoute("batch_once", completedBatch("batch_once")),
      outputRoute,
    ]);

    await GET(new Request(CRON_URL));
    const second = await GET(new Request(CRON_URL));
    expect(await second.json()).toEqual({ checked: 0, delivered: [] });
    expect(calls).toBe(1);
  });
});

describe("createBatchRoutes — cronSecret", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("rejects a request without the matching bearer token", async () => {
    let called = false;
    const { GET } = createBatchRoutes({
      cronSecret: "s3cret",
      onComplete: () => {
        called = true;
      },
      store: createMemoryStore(),
    });
    const response = await GET(new Request(CRON_URL));
    expect(response.status).toBe(401);
    expect(called).toBe(false);
  });

  it("allows a request with the matching bearer token", async () => {
    const { GET } = createBatchRoutes({
      cronSecret: "s3cret",
      onComplete: () => {
        /* no batches tracked */
      },
      store: createMemoryStore(),
    });
    const response = await GET(
      new Request(CRON_URL, { headers: { authorization: "Bearer s3cret" } })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ checked: 0, delivered: [] });
  });
});

describe("createBatchRoutes — OpenAI native webhook (POST)", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const signingSecret = "whsec_dGVzdHNlY3JldA==";

  const signedRequest = async (id: string) => {
    const body = JSON.stringify({ data: { id }, type: "batch.completed" });
    const headers = await signWebhook(
      signingSecret,
      "evt_1",
      body,
      Date.now() / 1000
    );
    return new Request("https://app.test/api/batches/openai", {
      body,
      headers,
      method: "POST",
    });
  };

  it("invokes onComplete (no outbound webhook) when a native event arrives", async () => {
    const store = createMemoryStore();
    const calls: BatchWebhookEvent[] = [];
    const { POST, track } = createBatchRoutes({
      credentials: { apiKey: "k" },
      onComplete: (event) => {
        calls.push(event);
      },
      openaiSigningSecret: signingSecret,
      store,
    });
    expect(POST).toBeDefined();
    await track({ id: "batch_oai", provider: "openai" });
    const fetchMock = install([
      retrieveRoute("batch_oai", completedBatch("batch_oai")),
      outputRoute,
    ]);

    const response = await POST?.(await signedRequest("batch_oai"));
    expect(response?.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.type).toBe("batch.completed");
    // No HTTP webhook is delivered — the callback is the sink.
    expect(
      fetchMock.mock.calls.every(
        (call) => new URL(String(call[0])).hostname === "api.openai.com"
      )
    ).toBe(true);
    const stored = await store.get("batch_oai");
    expect(stored?.deliveredAt).toBeDefined();
  });

  it("does not re-fire onComplete from the cron after the webhook delivered", async () => {
    const store = createMemoryStore();
    let calls = 0;
    const { GET, POST, track } = createBatchRoutes({
      credentials: { apiKey: "k" },
      onComplete: () => {
        calls += 1;
      },
      openaiSigningSecret: signingSecret,
      store,
    });
    await track({ id: "batch_dup", provider: "openai" });
    install([
      retrieveRoute("batch_dup", completedBatch("batch_dup")),
      outputRoute,
    ]);

    await POST?.(await signedRequest("batch_dup"));
    const tick = await GET(new Request(CRON_URL));
    expect(await tick.json()).toEqual({ checked: 0, delivered: [] });
    expect(calls).toBe(1);
  });

  it("omits POST when no openaiSigningSecret is configured", () => {
    const { POST } = createBatchRoutes({
      onComplete: () => {
        /* noop */
      },
      store: createMemoryStore(),
    });
    expect(POST).toBeUndefined();
  });
});

describe("createBatchRoutes — track", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("registers a batch with no webhookUrl, defaulting to in_progress", async () => {
    const store = createMemoryStore();
    const { track } = createBatchRoutes({
      onComplete: () => {
        /* noop */
      },
      store,
    });
    const record = await track({ id: "batch_t", provider: "anthropic" });
    expect(record).toMatchObject({
      id: "batch_t",
      provider: "anthropic",
      status: "in_progress",
    });
    const stored = await store.get("batch_t");
    expect(stored?.webhookUrl).toBeUndefined();
    expect(stored?.status).toBe("in_progress");
  });
});
