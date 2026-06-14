import { describe, expect, it } from "bun:test";

import { BatchJob, isTerminalStatus } from "../src/job";
import type { BatchAdapter } from "../src/providers/adapter";
import type { BatchResult, BatchSnapshot, BatchStatus } from "../src/types";

const snapshot = (status: BatchStatus): BatchSnapshot => ({
  id: "batch_1",
  provider: "openai",
  raw: {},
  requestCounts: { completed: 0, failed: 0, total: 1 },
  status,
});

interface FakeOptions {
  statuses?: BatchStatus[];
  results?: BatchResult[];
  onCancel?: () => void;
  onRetrieve?: () => void;
}

/** A controllable adapter: `retrieve` walks `statuses`, holding the last one. */
const fakeAdapter = (options: FakeOptions = {}): BatchAdapter => {
  const statuses = options.statuses ?? ["completed"];
  let index = 0;
  return {
    cancel: () => {
      options.onCancel?.();
      return Promise.resolve();
    },
    id: "openai",
    // oxlint-disable-next-line require-yield -- a fake generator over a fixed list.
    results: async function* results(): AsyncGenerator<BatchResult> {
      for (const result of options.results ?? []) {
        yield result;
      }
    },
    retrieve: () => {
      options.onRetrieve?.();
      const status = statuses[Math.min(index, statuses.length - 1)];
      index += 1;
      return Promise.resolve(snapshot(status as BatchStatus));
    },
    submit: () => Promise.resolve(snapshot("validating")),
  };
};

const job = (adapter: BatchAdapter, status: BatchStatus = "validating") =>
  new BatchJob(adapter, {}, snapshot(status));

describe("isTerminalStatus", () => {
  it("recognizes terminal and non-terminal statuses", () => {
    for (const status of [
      "completed",
      "failed",
      "expired",
      "cancelled",
    ] as const) {
      expect(isTerminalStatus(status)).toBe(true);
    }
    for (const status of [
      "validating",
      "in_progress",
      "finalizing",
      "cancelling",
    ] as const) {
      expect(isTerminalStatus(status)).toBe(false);
    }
  });
});

describe("BatchJob", () => {
  it("exposes the snapshot through its getters", () => {
    const handle = job(fakeAdapter(), "validating");
    expect(handle.id).toBe("batch_1");
    expect(handle.provider).toBe("openai");
    expect(handle.status).toBe("validating");
    expect(handle.requestCounts).toEqual({
      completed: 0,
      failed: 0,
      total: 1,
    });
    expect(handle.snapshot.status).toBe("validating");
  });

  it("refreshes the snapshot on poll", async () => {
    const handle = job(fakeAdapter({ statuses: ["completed"] }), "validating");
    const refreshed = await handle.poll();
    expect(refreshed.status).toBe("completed");
    expect(handle.status).toBe("completed");
  });

  it("polls until terminal, invoking onPoll each time", async () => {
    const seen: BatchStatus[] = [];
    const handle = job(
      fakeAdapter({ statuses: ["in_progress", "in_progress", "completed"] }),
      "validating"
    );
    const final = await handle.wait({
      onPoll: (s) => seen.push(s.status),
      pollIntervalMs: 1,
    });
    expect(final.status).toBe("completed");
    expect(seen).toEqual(["in_progress", "in_progress", "completed"]);
  });

  it("throws when the deadline passes", async () => {
    const handle = job(fakeAdapter({ statuses: ["in_progress"] }));
    await expect(
      handle.wait({ pollIntervalMs: 5, timeoutMs: 1 })
    ).rejects.toThrow("timed out waiting");
  });

  it("throws when the signal is already aborted at the loop check", async () => {
    const controller = new AbortController();
    const handle = job(fakeAdapter({ statuses: ["in_progress"] }));
    await expect(
      handle.wait({
        onPoll: () => controller.abort(),
        pollIntervalMs: 1,
        signal: controller.signal,
      })
    ).rejects.toThrow("wait aborted");
  });

  it("rejects when aborted mid-delay", async () => {
    const controller = new AbortController();
    const handle = job(fakeAdapter({ statuses: ["in_progress"] }));
    setTimeout(() => controller.abort(), 5);
    await expect(
      handle.wait({ pollIntervalMs: 5000, signal: controller.signal })
    ).rejects.toThrow("wait aborted");
  });

  it("streams and collects results", async () => {
    const results: BatchResult[] = [
      { customId: "a", status: "succeeded", text: "hi" },
      { customId: "b", status: "errored" },
    ];
    const handle = job(fakeAdapter({ results }));
    expect(await handle.collect()).toEqual(results);
  });

  it("cancels then refreshes the status", async () => {
    let cancelled = false;
    const handle = job(
      fakeAdapter({
        onCancel: () => {
          cancelled = true;
        },
        statuses: ["cancelled"],
      })
    );
    const after = await handle.cancel();
    expect(cancelled).toBe(true);
    expect(after.status).toBe("cancelled");
  });
});
