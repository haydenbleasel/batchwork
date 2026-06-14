import { afterEach, describe, expect, it, mock } from "bun:test";

import { createBatchPoller } from "../src/server/poller";
import { signWebhook, verifyBatchWebhook } from "../src/server/signing";
import { createMemoryStore } from "../src/server/store";
import type { BatchWebhookEvent } from "../src/server/types";

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

const WEBHOOK_URL = "https://app.test/webhooks/batch";
const SECRET = "topsecret";

const completedBatch = (id: string) => ({
  id,
  output_file_id: "file-out",
  request_counts: { completed: 2, failed: 0, total: 2 },
  status: "completed",
});

describe("createMemoryStore", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("filters by delivery state", async () => {
    const store = createMemoryStore();
    await store.set({
      createdAt: "now",
      id: "a",
      provider: "openai",
      status: "in_progress",
      webhookUrl: WEBHOOK_URL,
    });
    await store.set({
      createdAt: "now",
      deliveredAt: "later",
      id: "b",
      provider: "anthropic",
      status: "completed",
      webhookUrl: WEBHOOK_URL,
    });

    const undelivered = await store.list({ delivered: false });
    const delivered = await store.list({ delivered: true });
    const all = await store.list();
    expect(undelivered.map((r) => r.id)).toEqual(["a"]);
    expect(delivered.map((r) => r.id)).toEqual(["b"]);
    expect(all).toHaveLength(2);
  });
});

describe("signing round-trip", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("signs and verifies an event", async () => {
    const event: BatchWebhookEvent = {
      id: "batch_1",
      provider: "openai",
      requestCounts: { completed: 1, failed: 0, total: 1 },
      type: "batch.completed",
    };
    const body = JSON.stringify(event);
    const headers = await signWebhook(
      SECRET,
      event.id,
      body,
      Date.now() / 1000
    );
    const request = new Request(WEBHOOK_URL, { body, headers, method: "POST" });

    expect(await verifyBatchWebhook(request, SECRET)).toEqual(event);
  });

  it("rejects a tampered body", async () => {
    const headers = await signWebhook(
      SECRET,
      "batch_1",
      "{}",
      Date.now() / 1000
    );
    const request = new Request(WEBHOOK_URL, {
      body: '{"tampered":true}',
      headers,
      method: "POST",
    });
    await expect(verifyBatchWebhook(request, SECRET)).rejects.toThrow(
      "verification failed"
    );
  });
});

describe("createBatchPoller", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("delivers a signed webhook when a tracked batch completes", async () => {
    const store = createMemoryStore();
    const poller = createBatchPoller({
      credentials: { apiKey: "k" },
      store,
    });
    await poller.track(
      { id: "batch_1", provider: "openai" },
      { secret: SECRET, webhookUrl: WEBHOOK_URL }
    );

    const fetchMock = install([
      {
        body: completedBatch("batch_1"),
        match: (url, method) =>
          url.includes("/batches/batch_1") && method === "GET",
      },
      { body: "ok", match: (url) => url === WEBHOOK_URL },
    ]);

    const result = await poller.tick();
    expect(result).toEqual({ checked: 1, delivered: ["batch_1"] });

    const delivery = fetchMock.mock.calls.find(
      (call) => call[0] === WEBHOOK_URL
    );
    const init = delivery?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["webhook-signature"]).toMatch(/^v1,/u);

    const event = JSON.parse(String(init.body)) as BatchWebhookEvent;
    expect(event).toMatchObject({
      id: "batch_1",
      provider: "openai",
      type: "batch.completed",
    });

    // Verify what the receiver would: reconstruct the signed request.
    const received = new Request(WEBHOOK_URL, {
      body: String(init.body),
      headers,
      method: "POST",
    });
    expect(await verifyBatchWebhook(received, SECRET)).toEqual(event);

    const stored = await store.get("batch_1");
    expect(stored?.deliveredAt).toBeDefined();
  });

  it("does not deliver while a batch is still in progress", async () => {
    const store = createMemoryStore();
    const poller = createBatchPoller({ credentials: { apiKey: "k" }, store });
    await poller.track(
      { id: "batch_2", provider: "openai" },
      { webhookUrl: WEBHOOK_URL }
    );

    install([
      {
        body: {
          id: "batch_2",
          request_counts: { completed: 0, failed: 0, total: 2 },
          status: "in_progress",
        },
        match: (url) => url.includes("/batches/batch_2"),
      },
    ]);

    const result = await poller.tick();
    expect(result.delivered).toEqual([]);
    const stored = await store.get("batch_2");
    expect(stored?.deliveredAt).toBeUndefined();
  });

  it("delivers when an OpenAI native webhook arrives", async () => {
    const store = createMemoryStore();
    const poller = createBatchPoller({ credentials: { apiKey: "k" }, store });
    await poller.track(
      { id: "batch_3", provider: "openai" },
      { secret: SECRET, webhookUrl: WEBHOOK_URL }
    );

    const fetchMock = install([
      {
        body: completedBatch("batch_3"),
        match: (url, method) =>
          url.includes("/batches/batch_3") && method === "GET",
      },
      { body: "ok", match: (url) => url === WEBHOOK_URL },
    ]);

    const signingSecret = "whsec_dGVzdHNlY3JldA==";
    const incomingBody = JSON.stringify({
      data: { id: "batch_3" },
      type: "batch.completed",
    });
    const headers = await signWebhook(
      signingSecret,
      "evt_1",
      incomingBody,
      Date.now() / 1000
    );
    const handler = poller.openaiWebhookHandler({ signingSecret });
    const response = await handler(
      new Request("https://app.test/webhooks/openai", {
        body: incomingBody,
        headers,
        method: "POST",
      })
    );

    expect(response.status).toBe(200);
    expect(fetchMock.mock.calls.some((call) => call[0] === WEBHOOK_URL)).toBe(
      true
    );
    const stored = await store.get("batch_3");
    expect(stored?.deliveredAt).toBeDefined();
  });
});
