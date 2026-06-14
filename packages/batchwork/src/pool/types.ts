import type { BatchRequest } from "../types";

/**
 * One request buffered by a {@link createBatchPool} pool, awaiting accumulation
 * into a batch. Persisted so the pool survives across serverless invocations.
 */
export interface PendingRequest {
  /** Unique id for this pending row — distinct from `request.customId`. */
  id: string;
  /** The pool this belongs to, so one store can back many keyed pools. */
  poolKey: string;
  /** The payload handed verbatim to `batch()` on flush. */
  request: BatchRequest;
  /** ISO timestamp the row was appended. Drives the duration trigger. */
  enqueuedAt: string;
  /** Set while a flush owns this row (see `claim`). */
  claimedAt?: string;
  /** The claim this row was assigned to, for idempotent release/recovery. */
  claimId?: string;
}

/** A set of pending rows claimed by a single flush, ready to assemble. */
export interface PendingClaim {
  claimId: string;
  poolKey: string;
  requests: PendingRequest[];
}

/**
 * Persistence for buffered requests. Implement against any KV/DB (Vercel KV,
 * Upstash Redis, Postgres). {@link createMemoryPendingStore} is provided for
 * development and single-process use.
 *
 * The atomicity contract lives entirely in `claim`: two concurrent callers must
 * never receive the same row, so a flush can't be submitted twice. Back it with
 * a native primitive — Postgres `SELECT … FOR UPDATE SKIP LOCKED` then `UPDATE
 * … RETURNING`, or a Redis Lua `ZPOPMIN`-into-claim script. Durable
 * implementations should also reclaim rows whose `claimedAt` is older than a TTL
 * (≈ `2 × maxDuration`) so a crash between claim and resolve can't strand them.
 */
export interface PendingRequestStore {
  /** Append a pending request. */
  append: (record: PendingRequest) => Promise<void>;
  /** Count rows currently pending (unclaimed) for a pool. Drives the size trigger. */
  count: (poolKey: string) => Promise<number>;
  /** ISO `enqueuedAt` of the oldest pending row, or null when empty. Drives the age trigger. */
  oldestEnqueuedAt: (poolKey: string) => Promise<string | null>;
  /**
   * Atomically claim up to `limit` of the oldest pending rows. Returns a claim
   * no other concurrent caller can also receive, or null when nothing is claimable.
   */
  claim: (poolKey: string, limit: number) => Promise<PendingClaim | null>;
  /** Permanently remove a claim's rows — called after `batch()` + handoff succeed. */
  resolve: (claim: PendingClaim) => Promise<void>;
  /** Return a failed claim's rows to pending so the next flush retries them. */
  release: (claim: PendingClaim) => Promise<void>;
}
