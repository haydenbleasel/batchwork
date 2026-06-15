import { afterEach, describe, expect, it, mock } from "bun:test";

import { createBatchPoller } from "../src/server/poller";
import {
  signWebhook,
  verifyBatchWebhook,
  verifyWebhook,
} from "../src/server/signing";
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

  it("deletes records", async () => {
    const store = createMemoryStore();
    await store.set({
      createdAt: "now",
      id: "a",
      provider: "openai",
      status: "in_progress",
      webhookUrl: WEBHOOK_URL,
    });
    expect(await store.get("a")).not.toBeNull();
    await store.delete("a");
    expect(await store.get("a")).toBeNull();
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

  it("rejects unsafe default webhook URLs before tracking", async () => {
    const poller = createBatchPoller({
      credentials: { apiKey: "k" },
      store: createMemoryStore(),
    });

    await expect(
      poller.track(
        { id: "batch_http", provider: "openai" },
        { webhookUrl: "http://example.com/webhooks/batch" }
      )
    ).rejects.toThrow("must use https");
    await expect(
      poller.track(
        { id: "batch_private", provider: "openai" },
        { webhookUrl: "https://127.0.0.1/internal" }
      )
    ).rejects.toThrow("private networks");
  });

  it("revalidates stored webhook URLs before delivery", async () => {
    const store = createMemoryStore();
    const poller = createBatchPoller({ credentials: { apiKey: "k" }, store });
    await store.set({
      createdAt: "now",
      id: "batch_private",
      provider: "openai",
      status: "in_progress",
      webhookUrl: "https://127.0.0.1/internal",
    });
    install([
      {
        body: completedBatch("batch_private"),
        match: (url, method) =>
          url.includes("/batches/batch_private") && method === "GET",
      },
    ]);

    await expect(poller.tick()).rejects.toThrow("private networks");
    const stored = await store.get("batch_private");
    expect(stored?.deliveredAt).toBeUndefined();
  });

  it("supports custom webhook URL validators", async () => {
    const store = createMemoryStore();
    const validated: string[] = [];
    const poller = createBatchPoller({
      credentials: { apiKey: "k" },
      store,
      validateWebhookUrl: (url) => {
        validated.push(url.toString());
      },
    });
    const webhookUrl = "http://127.0.0.1:8080/internal";
    await poller.track(
      { id: "batch_custom", provider: "openai" },
      { webhookUrl }
    );

    const fetchMock = install([
      {
        body: completedBatch("batch_custom"),
        match: (url, method) =>
          url.includes("/batches/batch_custom") && method === "GET",
      },
      { body: "ok", match: (url) => url === webhookUrl },
    ]);

    await expect(poller.tick()).resolves.toEqual({
      checked: 1,
      delivered: ["batch_custom"],
    });
    expect(validated).toEqual([webhookUrl, webhookUrl]);
    expect(fetchMock.mock.calls.some((call) => call[0] === webhookUrl)).toBe(
      true
    );
  });

  it("routes completion to a custom onComplete sink instead of a webhook", async () => {
    const store = createMemoryStore();
    const sinkCalls: string[] = [];
    const poller = createBatchPoller({
      credentials: { apiKey: "k" },
      onComplete: (record) => {
        sinkCalls.push(record.id);
        return Promise.resolve();
      },
      store,
    });
    await poller.track({ id: "batch_sink", provider: "openai" }, {});

    const fetchMock = install([
      {
        body: completedBatch("batch_sink"),
        match: (url, method) =>
          url.includes("/batches/batch_sink") && method === "GET",
      },
    ]);

    const result = await poller.tick();
    expect(result).toEqual({ checked: 1, delivered: ["batch_sink"] });
    expect(sinkCalls).toEqual(["batch_sink"]);
    // The default webhook delivery is replaced — no outbound POST occurred.
    expect(fetchMock.mock.calls.some((call) => call[0] === WEBHOOK_URL)).toBe(
      false
    );
    const stored = await store.get("batch_sink");
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

  it("resolves credentials from a per-provider function", async () => {
    const store = createMemoryStore();
    const seen: string[] = [];
    const poller = createBatchPoller({
      credentials: (provider) => {
        seen.push(provider);
        return { apiKey: `k-${provider}` };
      },
      store,
    });
    await poller.track(
      { id: "batch_fn", provider: "openai" },
      { webhookUrl: WEBHOOK_URL }
    );
    install([
      {
        body: completedBatch("batch_fn"),
        match: (url, method) =>
          url.includes("/batches/batch_fn") && method === "GET",
      },
      { body: "ok", match: (url) => url === WEBHOOK_URL },
    ]);

    await poller.tick();
    expect(seen).toContain("openai");
  });

  it("persists a non-terminal status change without delivering", async () => {
    const store = createMemoryStore();
    const poller = createBatchPoller({ credentials: { apiKey: "k" }, store });
    await poller.track(
      { id: "batch_change", provider: "openai" },
      { webhookUrl: WEBHOOK_URL }
    );
    install([
      {
        body: {
          id: "batch_change",
          request_counts: { completed: 0, failed: 0, total: 2 },
          status: "finalizing",
        },
        match: (url) => url.includes("/batches/batch_change"),
      },
    ]);

    const result = await poller.tick();
    expect(result.delivered).toEqual([]);
    const stored = await store.get("batch_change");
    expect(stored?.status).toBe("finalizing");
    expect(stored?.deliveredAt).toBeUndefined();
  });

  it("throws when a completed batch has no webhookUrl to deliver to", async () => {
    const store = createMemoryStore();
    // No `onComplete` sink and no `webhookUrl`: the default webhook sink has
    // nowhere to deliver, so delivery throws (and, with no `onError`, the tick
    // propagates it).
    const poller = createBatchPoller({ credentials: { apiKey: "k" }, store });
    await poller.track({ id: "batch_nourl", provider: "openai" }, {});
    install([
      {
        body: completedBatch("batch_nourl"),
        match: (url, method) =>
          url.includes("/batches/batch_nourl") && method === "GET",
      },
    ]);

    await expect(poller.tick()).rejects.toThrow("no webhookUrl");
    const stored = await store.get("batch_nourl");
    expect(stored?.deliveredAt).toBeUndefined();
  });

  it("throws when webhook delivery fails", async () => {
    const store = createMemoryStore();
    const poller = createBatchPoller({ credentials: { apiKey: "k" }, store });
    await poller.track(
      { id: "batch_fail", provider: "openai" },
      { webhookUrl: WEBHOOK_URL }
    );
    const fetchMock = mock(
      (input: string | URL | Request): Promise<Response> => {
        const url = String(input);
        if (url.includes("/batches/batch_fail")) {
          return Promise.resolve(
            Response.json(completedBatch("batch_fail"), {
              status: 200,
            })
          );
        }
        if (url === WEBHOOK_URL) {
          return Promise.resolve(new Response("nope", { status: 500 }));
        }
        return Promise.reject(new Error(`unexpected ${url}`));
      }
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    await expect(poller.tick()).rejects.toThrow("webhook delivery");
  });

  describe("openaiWebhookHandler edge cases", () => {
    const signingSecret = "whsec_dGVzdHNlY3JldA==";

    const signed = async (body: string) => {
      const headers = await signWebhook(
        signingSecret,
        "evt_1",
        body,
        Date.now() / 1000
      );
      return new Request("https://app.test/webhooks/openai", {
        body,
        headers,
        method: "POST",
      });
    };

    it("rejects an invalid signature with 400", async () => {
      const poller = createBatchPoller({ store: createMemoryStore() });
      const handler = poller.openaiWebhookHandler({ signingSecret });
      const response = await handler(
        new Request("https://app.test/webhooks/openai", {
          body: "{}",
          method: "POST",
        })
      );
      expect(response.status).toBe(400);
    });

    it("ignores non-batch events with 202", async () => {
      const poller = createBatchPoller({ store: createMemoryStore() });
      const handler = poller.openaiWebhookHandler({ signingSecret });
      const response = await handler(
        await signed(JSON.stringify({ data: { id: "x" }, type: "thread.run" }))
      );
      expect(response.status).toBe(202);
    });

    it("rejects a batch event with no id with 400", async () => {
      const poller = createBatchPoller({ store: createMemoryStore() });
      const handler = poller.openaiWebhookHandler({ signingSecret });
      const response = await handler(
        await signed(JSON.stringify({ data: {}, type: "batch.completed" }))
      );
      expect(response.status).toBe(400);
    });

    it("acks an unknown batch id with 200", async () => {
      const poller = createBatchPoller({ store: createMemoryStore() });
      const handler = poller.openaiWebhookHandler({ signingSecret });
      const response = await handler(
        await signed(
          JSON.stringify({ data: { id: "unknown" }, type: "batch.completed" })
        )
      );
      expect(response.status).toBe(200);
    });

    it("does not deliver when the batch is still in progress", async () => {
      const store = createMemoryStore();
      const poller = createBatchPoller({ credentials: { apiKey: "k" }, store });
      await poller.track(
        { id: "batch_wip", provider: "openai" },
        { webhookUrl: WEBHOOK_URL }
      );
      install([
        {
          body: {
            id: "batch_wip",
            request_counts: { completed: 0, failed: 0, total: 1 },
            status: "in_progress",
          },
          match: (url) => url.includes("/batches/batch_wip"),
        },
      ]);
      const handler = poller.openaiWebhookHandler({ signingSecret });
      const response = await handler(
        await signed(
          JSON.stringify({ data: { id: "batch_wip" }, type: "batch.completed" })
        )
      );
      expect(response.status).toBe(200);
      const stored = await store.get("batch_wip");
      expect(stored?.deliveredAt).toBeUndefined();
    });
  });
});

describe("verifyWebhook edge cases", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("throws when signature headers are missing", async () => {
    const request = new Request(WEBHOOK_URL, { body: "{}", method: "POST" });
    await expect(verifyWebhook(request, SECRET)).rejects.toThrow(
      "missing webhook signature headers"
    );
  });

  it("rejects a timestamp outside tolerance", async () => {
    const body = "{}";
    const stale = Date.now() / 1000 - 10_000;
    const headers = await signWebhook(SECRET, "batch_1", body, stale);
    const request = new Request(WEBHOOK_URL, { body, headers, method: "POST" });
    await expect(verifyWebhook(request, SECRET)).rejects.toThrow(
      "timestamp outside tolerance"
    );
  });

  it("rejects a non-numeric timestamp", async () => {
    const request = new Request(WEBHOOK_URL, {
      body: "{}",
      headers: {
        "webhook-id": "batch_1",
        "webhook-signature": "v1,abc",
        "webhook-timestamp": "not-a-number",
      },
      method: "POST",
    });
    await expect(verifyWebhook(request, SECRET)).rejects.toThrow(
      "timestamp outside tolerance"
    );
  });
});
