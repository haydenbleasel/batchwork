import type { BatchProvider, BatchRequestCounts, BatchStatus } from "../types";

/** The unified webhook event batchwork delivers when a batch finishes. */
export type BatchWebhookEventType =
  | "batch.completed"
  | "batch.failed"
  | "batch.expired"
  | "batch.cancelled";

export interface BatchWebhookEvent {
  type: BatchWebhookEventType;
  id: string;
  provider: BatchProvider;
  requestCounts: BatchRequestCounts;
  createdAt?: string;
  completedAt?: string;
}

/** A batch being watched by the poller, plus its delivery target. */
export interface TrackedBatch {
  id: string;
  provider: BatchProvider;
  /** Where to POST the completion webhook. Omitted for callback-based flows. */
  webhookUrl?: string;
  webhookSecret?: string;
  status: BatchStatus;
  createdAt: string;
  /** Set once the completion webhook has been delivered. */
  deliveredAt?: string;
}

/**
 * Persistence for tracked batches. Implement against any KV/DB (Vercel KV,
 * Upstash Redis, Cloudflare KV, Postgres). `createMemoryStore` is provided for
 * development and single-process use.
 */
export interface BatchStore {
  get: (id: string) => Promise<TrackedBatch | null>;
  set: (record: TrackedBatch) => Promise<void>;
  delete: (id: string) => Promise<void>;
  list: (filter?: { delivered?: boolean }) => Promise<TrackedBatch[]>;
}
