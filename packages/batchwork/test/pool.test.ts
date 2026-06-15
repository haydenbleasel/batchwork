import { afterEach, describe, expect, it, mock } from "bun:test";
import { setTimeout as sleep } from "node:timers/promises";

import { createBatchRoutes } from "../src/next";
import { createBatchPool, createMemoryPendingStore } from "../src/pool";
import { createMemoryStore } from "../src/server/store";

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

/** Routes for the OpenAI submit flow a flush triggers: upload file, create batch. */
const FILES_ROUTE: Route = {
  body: { id: "file-in" },
  match: (url, method) => url.endsWith("/files") && method === "POST",
};
const BATCHES_ROUTE: Route = {
  body: {
    id: "batch_1",
    request_counts: { completed: 0, failed: 0, total: 2 },
    status: "validating",
  },
  match: (url, method) => url.endsWith("/batches") && method === "POST",
};

const submitRoutes = () => install([FILES_ROUTE, BATCHES_ROUTE]);

describe("createBatchPool", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("flushes once maxSize is reached", async () => {
    submitRoutes();
    const tracked: string[] = [];
    const pool = createBatchPool({
      apiKey: "test-key",
      maxDuration: 3600,
      maxSize: 2,
      model: "openai/gpt-4o-mini",
      store: createMemoryPendingStore(),
      track: (job) => {
        tracked.push(job.id);
      },
    });

    await pool.add({ customId: "a", prompt: "Summarize this" });
    expect(tracked).toEqual([]);
    expect(await pool.size()).toBe(1);

    await pool.add({ customId: "b", prompt: "Translate this" });
    expect(tracked).toEqual(["batch_1"]);
    expect(await pool.size()).toBe(0);
  });

  it("returns the resolved customId from add (explicit and generated)", async () => {
    const pool = createBatchPool({
      apiKey: "test-key",
      maxDuration: 3600,
      maxSize: 100,
      model: "openai/gpt-4o-mini",
      store: createMemoryPendingStore(),
    });

    expect(await pool.add({ customId: "explicit", prompt: "x" })).toBe(
      "explicit"
    );
    const generated = await pool.add({ prompt: "y" });
    expect(generated).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u
    );
  });

  it("flushDue does nothing when the pool is empty", async () => {
    const pool = createBatchPool({
      apiKey: "test-key",
      maxDuration: 1,
      maxSize: 100,
      model: "openai/gpt-4o-mini",
      store: createMemoryPendingStore(),
    });

    expect(await pool.flushDue()).toEqual([]);
  });

  it("flushDue does nothing while items are fresh", async () => {
    const pool = createBatchPool({
      apiKey: "test-key",
      maxDuration: 3600,
      maxSize: 100,
      model: "openai/gpt-4o-mini",
      store: createMemoryPendingStore(),
    });

    await pool.add({ customId: "a", prompt: "x" });
    expect(await pool.flushDue()).toEqual([]);
    expect(await pool.size()).toBe(1);
  });

  it("flushDue flushes a sub-maxSize batch once items age out", async () => {
    submitRoutes();
    const store = createMemoryPendingStore();
    await store.append({
      enqueuedAt: new Date(Date.now() - 10_000).toISOString(),
      id: "row-1",
      poolKey: "test",
      request: { customId: "a", prompt: "hi" },
    });
    const tracked: string[] = [];
    const pool = createBatchPool({
      apiKey: "test-key",
      maxDuration: 1,
      maxSize: 100,
      model: "openai/gpt-4o-mini",
      poolKey: "test",
      store,
      track: (job) => {
        tracked.push(job.id);
      },
    });

    const jobs = await pool.flushDue();
    expect(jobs.map((job) => job.id)).toEqual(["batch_1"]);
    expect(tracked).toEqual(["batch_1"]);
    expect(await pool.size()).toBe(0);
  });

  it("claims disjoint rows under concurrent flushes", async () => {
    submitRoutes();
    const store = createMemoryPendingStore();
    for (let index = 0; index < 5; index += 1) {
      // oxlint-disable-next-line no-await-in-loop -- sequential test setup.
      await store.append({
        enqueuedAt: new Date(Date.now() + index).toISOString(),
        id: `row-${index}`,
        poolKey: "test",
        request: { customId: `c${index}`, prompt: "x" },
      });
    }
    const seen: string[] = [];
    const pool = createBatchPool({
      apiKey: "test-key",
      maxDuration: 3600,
      maxSize: 2,
      model: "openai/gpt-4o-mini",
      onFlush: (_job, requests) => {
        for (const request of requests) {
          seen.push(request.customId ?? "");
        }
      },
      poolKey: "test",
      store,
    });

    await Promise.all([pool.flush(), pool.flush(), pool.flush()]);

    expect([...seen].toSorted()).toEqual(["c0", "c1", "c2", "c3", "c4"]);
    // No row was claimed twice.
    expect(seen).toHaveLength(5);
    expect(await pool.size()).toBe(0);
  });

  it("releases a claim when submit fails, then retries", async () => {
    const store = createMemoryPendingStore();
    await store.append({
      enqueuedAt: new Date().toISOString(),
      id: "row-1",
      poolKey: "test",
      request: { customId: "a", prompt: "hi" },
    });
    let batchAttempts = 0;
    const fetchMock = mock(
      (
        input: string | URL | Request,
        init?: RequestInit
      ): Promise<Response> => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (url.endsWith("/files") && method === "POST") {
          return Promise.resolve(Response.json({ id: "file-in" }));
        }
        if (url.endsWith("/batches") && method === "POST") {
          batchAttempts += 1;
          if (batchAttempts === 1) {
            return Promise.resolve(new Response("boom", { status: 500 }));
          }
          return Promise.resolve(
            Response.json({
              id: "batch_1",
              request_counts: { completed: 0, failed: 0, total: 1 },
              status: "validating",
            })
          );
        }
        return Promise.reject(new Error(`unexpected ${method} ${url}`));
      }
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const errors: unknown[] = [];
    const pool = createBatchPool({
      apiKey: "test-key",
      maxDuration: 3600,
      maxSize: 10,
      model: "openai/gpt-4o-mini",
      onError: (error) => errors.push(error),
      poolKey: "test",
      store,
    });

    expect(await pool.flush()).toBeUndefined();
    expect(errors).toHaveLength(1);
    // The failed claim was released back to pending.
    expect(await pool.size()).toBe(1);

    const retried = await pool.flush();
    expect(retried?.id).toBe("batch_1");
    expect(await pool.size()).toBe(0);
  });

  it("awaits async onFlush after resolving claimed rows", async () => {
    submitRoutes();
    const store = createMemoryPendingStore();
    await store.append({
      enqueuedAt: new Date().toISOString(),
      id: "row-1",
      poolKey: "test",
      request: { customId: "a", prompt: "hi" },
    });
    const order: string[] = [];
    const pool = createBatchPool({
      apiKey: "test-key",
      maxDuration: 3600,
      maxSize: 10,
      model: "openai/gpt-4o-mini",
      onFlush: async () => {
        expect(await store.count("test")).toBe(0);
        await sleep(1);
        order.push("onFlush");
      },
      poolKey: "test",
      store,
    });

    const job = await pool.flush();
    order.push("after");

    expect(job?.id).toBe("batch_1");
    expect(order).toEqual(["onFlush", "after"]);
    expect(await pool.size()).toBe(0);
  });

  it("close flushes remaining items and rejects further adds", async () => {
    submitRoutes();
    const tracked: string[] = [];
    const pool = createBatchPool({
      apiKey: "test-key",
      maxDuration: 3600,
      maxSize: 100,
      model: "openai/gpt-4o-mini",
      store: createMemoryPendingStore(),
      track: (job) => {
        tracked.push(job.id);
      },
    });

    await pool.add({ customId: "a", prompt: "hi" });
    const jobs = await pool.close();
    expect(jobs.map((job) => job.id)).toEqual(["batch_1"]);
    expect(tracked).toEqual(["batch_1"]);
    await expect(pool.add({ prompt: "b" })).rejects.toThrow("closed");
  });

  it("clears the armed timer on close before it fires", async () => {
    submitRoutes();
    const tracked: string[] = [];
    const pool = createBatchPool({
      apiKey: "test-key",
      // Long window so the armed timer can't fire during the test — close()
      // must clear it explicitly.
      maxDuration: 3600,
      maxSize: 100,
      model: "openai/gpt-4o-mini",
      poolKey: "test",
      timer: true,
      track: (job) => {
        tracked.push(job.id);
      },
    });

    await pool.add({ customId: "a", prompt: "hi" });
    const jobs = await pool.close();
    expect(jobs.map((job) => job.id)).toEqual(["batch_1"]);
    expect(tracked).toEqual(["batch_1"]);
  });

  it("rethrows a submit failure when no onError handler is set", async () => {
    const store = createMemoryPendingStore();
    await store.append({
      enqueuedAt: new Date().toISOString(),
      id: "row-1",
      poolKey: "test",
      request: { customId: "a", prompt: "hi" },
    });
    const fetchMock = mock(
      (
        input: string | URL | Request,
        init?: RequestInit
      ): Promise<Response> => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (url.endsWith("/files") && method === "POST") {
          return Promise.resolve(Response.json({ id: "file-in" }));
        }
        if (url.endsWith("/batches") && method === "POST") {
          return Promise.resolve(new Response("boom", { status: 500 }));
        }
        return Promise.reject(new Error(`unexpected ${method} ${url}`));
      }
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const pool = createBatchPool({
      apiKey: "test-key",
      maxDuration: 3600,
      maxSize: 10,
      model: "openai/gpt-4o-mini",
      poolKey: "test",
      store,
    });

    await expect(pool.flush()).rejects.toThrow();
    // The failed claim is released back to pending for a later retry.
    expect(await pool.size()).toBe(1);
  });

  it("self-schedules a flush in timer mode", async () => {
    submitRoutes();
    const tracked: string[] = [];
    const pool = createBatchPool({
      apiKey: "test-key",
      maxDuration: 0.02,
      maxSize: 100,
      model: "openai/gpt-4o-mini",
      poolKey: "test",
      timer: true,
      track: (job) => {
        tracked.push(job.id);
      },
    });

    await pool.add({ customId: "a", prompt: "hi" });
    await sleep(60);

    expect(tracked).toEqual(["batch_1"]);
    expect(await pool.size()).toBe(0);
    await pool.close();
  });

  it("flows results back through createBatchRoutes", async () => {
    const received: { customId: string; text?: string }[] = [];
    const routes = createBatchRoutes({
      credentials: { apiKey: "test-key" },
      onComplete: async (_event, results) => {
        for await (const result of results) {
          received.push({ customId: result.customId, text: result.text });
        }
      },
      store: createMemoryStore(),
    });
    const pool = createBatchPool({
      apiKey: "test-key",
      maxDuration: 3600,
      maxSize: 2,
      model: "openai/gpt-4o-mini",
      store: createMemoryPendingStore(),
      track: (job) => routes.track(job),
    });

    install([
      FILES_ROUTE,
      BATCHES_ROUTE,
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
        body:
          '{"custom_id":"a","response":{"status_code":200,"body":{"choices":[{"message":{"content":"hi-a"}}]}}}\n' +
          '{"custom_id":"b","response":{"status_code":200,"body":{"choices":[{"message":{"content":"hi-b"}}]}}}',
        match: (url) => url.includes("/files/file-out/content"),
      },
    ]);

    await pool.add({ customId: "a", prompt: "x" });
    // Second add reaches maxSize, triggering the flush + track.
    await pool.add({ customId: "b", prompt: "y" });

    const response = await routes.GET(
      new Request("https://app.test/api/batches")
    );
    const json = (await response.json()) as { delivered: string[] };
    expect(json.delivered).toEqual(["batch_1"]);

    const sorted = received.toSorted((a, b) =>
      a.customId.localeCompare(b.customId)
    );
    expect(sorted).toEqual([
      { customId: "a", text: "hi-a" },
      { customId: "b", text: "hi-b" },
    ]);
  });

  it("rejects an invalid maxSize or maxDuration", () => {
    expect(() =>
      createBatchPool({
        maxDuration: 3600,
        maxSize: 0,
        model: "openai/gpt-4o-mini",
      })
    ).toThrow("maxSize");
    expect(() =>
      createBatchPool({
        maxDuration: 0,
        maxSize: 10,
        model: "openai/gpt-4o-mini",
      })
    ).toThrow("maxDuration");
  });
});
