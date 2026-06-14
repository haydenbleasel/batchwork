import type { BatchProvider, BatchSnapshot, BatchStatus } from "../types";
import type { BatchWebhookEvent, BatchWebhookEventType } from "./types";

const EVENT_BY_STATUS: Partial<Record<BatchStatus, BatchWebhookEventType>> = {
  cancelled: "batch.cancelled",
  completed: "batch.completed",
  expired: "batch.expired",
  failed: "batch.failed",
};

/** Map a terminal snapshot to the unified webhook event batchwork delivers. */
export const toEvent = (
  provider: BatchProvider,
  snapshot: BatchSnapshot
): BatchWebhookEvent => ({
  completedAt: snapshot.completedAt?.toISOString(),
  createdAt: snapshot.createdAt?.toISOString(),
  id: snapshot.id,
  provider,
  requestCounts: snapshot.requestCounts,
  type: EVENT_BY_STATUS[snapshot.status] ?? "batch.completed",
});
