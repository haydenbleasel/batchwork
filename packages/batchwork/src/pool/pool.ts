import type { LanguageModel } from "ai";

import { batch } from "../batch";
import { BatchworkError } from "../errors";
import type { BatchJob } from "../job";
import { resolveModel } from "../model";
import type {
  BatchDefaults,
  BatchRequest,
  ProviderCredentials,
} from "../types";
import { createMemoryPendingStore } from "./store";
import type { PendingRequestStore } from "./types";

/** Input to {@link createBatchPool}. */
export interface BatchPoolOptions extends ProviderCredentials {
  /** Model every flush submits to. A pool targets exactly one model. */
  model: LanguageModel;
  /** Flush once this many requests accumulate. Must be an integer >= 1. */
  maxSize: number;
  /**
   * Flush once the oldest pending request reaches this age, in **seconds**
   * (e.g. `3600` = one hour). Note: seconds, unlike the `…Ms` options elsewhere.
   */
  maxDuration: number;
  /**
   * Durable store so the pool survives across serverless invocations. Defaults
   * to {@link createMemoryPendingStore} for single-process use.
   */
  store?: PendingRequestStore;
  /**
   * Hand each flushed batch to the server layer so its results flow back through
   * the same `onComplete`/webhook path as direct `batch()` users —
   * e.g. `track: (job) => routes.track(job)`. Required for any deployment that
   * outlives a single process; omit only for tests/demos (the job is returned
   * from `flush()`/`flushDue()` and surfaced via `onFlush`).
   */
  track?: (job: BatchJob) => unknown;
  /**
   * Isolate independent pools that share one store. Defaults to
   * `"<provider>:<modelId>"`, so pools for the same model coalesce.
   */
  poolKey?: string;
  /**
   * Self-schedule the duration flush with `setTimeout`. Defaults to `true` when
   * no `store` is given (single-process). Leave `false` for serverless and drive
   * the age trigger by calling {@link BatchPool.flushDue} from your cron.
   */
  timer?: boolean;
  /** Defaults merged into every request (same semantics as `batch()`). */
  defaults?: BatchDefaults;
  /** Provider metadata forwarded to each submitted batch. */
  metadata?: Record<string, string>;
  /** Called after a flush submits (and tracks) a batch. */
  onFlush?: (job: BatchJob, requests: BatchRequest[]) => void;
  /** Called when a flush throws; the claimed items are returned to pending first. */
  onError?: (error: unknown, requests: BatchRequest[]) => void;
}

/** A handle to an on-demand request pool. Returned by {@link createBatchPool}. */
export interface BatchPool {
  /** Buffer a request; returns its resolved `customId`. May trigger a size flush. */
  add: (request: BatchRequest) => Promise<string>;
  /** Flush up to `maxSize` pending requests now. `undefined` when nothing is pending. */
  flush: () => Promise<BatchJob | undefined>;
  /** Drain every pending request now, as one batch per `maxSize` chunk. */
  flushAll: () => Promise<BatchJob[]>;
  /** Drain only if the oldest pending request has aged past `maxDuration`. Call from cron. */
  flushDue: () => Promise<BatchJob[]>;
  /** Number of requests currently pending for this pool. */
  size: () => Promise<number>;
  /** Stop the timer and drain remaining requests. Idempotent; `add()` throws afterwards. */
  close: () => Promise<BatchJob[]>;
}

/**
 * Create an on-demand pool that buffers individual requests and submits them as
 * one `batch()` when a size or age threshold is hit — `maxSize` requests OR
 * `maxDuration` seconds since accumulation started, whichever comes first. The
 * pool sits in front of `batch()`; results flow back through the existing server
 * layer via {@link BatchPoolOptions.track}.
 *
 * Works in-process out of the box (in-memory buffer + a `setTimeout` timer);
 * pass a durable `store` and drive {@link BatchPool.flushDue} from a cron to make
 * it survive serverless/frontend traffic.
 *
 * @example
 * const pool = createBatchPool({
 *   model: openai("gpt-4o-mini"),
 *   maxSize: 50,
 *   maxDuration: 3600,
 *   track: (job) => routes.track(job),
 * });
 * await pool.add({ customId: "a", prompt: "Summarize this…" });
 */
export const createBatchPool = (options: BatchPoolOptions): BatchPool => {
  const { maxSize, maxDuration, model, track, defaults, metadata } = options;

  if (!Number.isInteger(maxSize) || maxSize < 1) {
    throw new BatchworkError("batchwork: `maxSize` must be an integer >= 1.");
  }
  if (!(maxDuration > 0)) {
    throw new BatchworkError(
      "batchwork: `maxDuration` must be greater than 0 seconds."
    );
  }

  const resolved = resolveModel(model);
  const store = options.store ?? createMemoryPendingStore();
  const poolKey = options.poolKey ?? `${resolved.provider}:${resolved.modelId}`;
  const maxDurationMs = maxDuration * 1000;
  const timerMode = options.timer ?? options.store === undefined;
  const credentials: ProviderCredentials = {
    apiKey: options.apiKey,
    baseURL: options.baseURL,
    headers: options.headers,
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  const clearTimer = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const flush = async (): Promise<BatchJob | undefined> => {
    const claim = await store.claim(poolKey, maxSize);
    if (!claim || claim.requests.length === 0) {
      return undefined;
    }
    const requests = claim.requests.map((row) => row.request);
    try {
      const job = await batch({
        ...credentials,
        defaults,
        metadata,
        model,
        requests,
      });
      // Hand off before resolving: if we crash after submit the batch is already
      // tracked, and only the pending rows leak (recovered by a store TTL reaper).
      if (track) {
        await track(job);
      }
      await store.resolve(claim);
      options.onFlush?.(job, requests);
      return job;
    } catch (error) {
      await store.release(claim);
      if (options.onError) {
        options.onError(error, requests);
        return undefined;
      }
      throw error;
    }
  };

  const flushAll = async (): Promise<BatchJob[]> => {
    const jobs: BatchJob[] = [];
    let job = await flush();
    while (job) {
      jobs.push(job);
      // oxlint-disable-next-line no-await-in-loop -- drain serially, one batch at a time.
      job = await flush();
    }
    return jobs;
  };

  const flushDue = async (): Promise<BatchJob[]> => {
    const oldest = await store.oldestEnqueuedAt(poolKey);
    if (oldest === null) {
      return [];
    }
    const aged = Date.now() - new Date(oldest).getTime() >= maxDurationMs;
    if (!aged && (await store.count(poolKey)) < maxSize) {
      return [];
    }
    return await flushAll();
  };

  const runTimerFlush = async (): Promise<void> => {
    try {
      await flushAll();
    } catch {
      // No `onError` handler: mirror the poller's at-least-once behavior —
      // released items stay pending and retry later. Set `onError` to observe.
    }
  };

  // The duration window is anchored to the first add into an empty pool: arm
  // only when no timer is active, so later adds don't reset it. On fire we drain
  // and stop; the next add re-arms. A failed flush (with `onError`) leaves its
  // items pending — they retry on the next add or `close()`.
  const armTimer = (): void => {
    if (timerMode && !closed && timer === undefined) {
      timer = setTimeout(() => {
        timer = undefined;
        void runTimerFlush();
      }, maxDurationMs);
    }
  };

  const add = async (request: BatchRequest): Promise<string> => {
    if (closed) {
      throw new BatchworkError("batchwork: pool is closed.");
    }
    const customId = request.customId ?? crypto.randomUUID();
    await store.append({
      enqueuedAt: new Date().toISOString(),
      id: crypto.randomUUID(),
      poolKey,
      request: { ...request, customId },
    });

    if ((await store.count(poolKey)) >= maxSize) {
      clearTimer();
      await flush();
    } else {
      armTimer();
    }
    return customId;
  };

  const close = async (): Promise<BatchJob[]> => {
    closed = true;
    clearTimer();
    return await flushAll();
  };

  return {
    add,
    close,
    flush,
    flushAll,
    flushDue,
    size: () => store.count(poolKey),
  };
};
