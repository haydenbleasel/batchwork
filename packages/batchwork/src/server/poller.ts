import { BatchworkError } from "../errors";
import { isTerminalStatus } from "../job";
import { getAdapter } from "../providers";
import type {
  BatchProvider,
  BatchSnapshot,
  BatchStatus,
  ProviderCredentials,
} from "../types";
import { signWebhook, verifyWebhook } from "./signing";
import type {
  BatchStore,
  BatchWebhookEvent,
  BatchWebhookEventType,
  TrackedBatch,
} from "./types";

/** Credentials for polling: a fixed config, or one resolved per provider. */
export type CredentialResolver =
  | ProviderCredentials
  | ((provider: BatchProvider) => ProviderCredentials);

export interface BatchPollerOptions {
  store: BatchStore;
  /** Falls back to provider env vars (e.g. `OPENAI_API_KEY`) when omitted. */
  credentials?: CredentialResolver;
}

export interface TrackTarget {
  id: string;
  provider: BatchProvider;
  status?: BatchStatus;
}

export interface TrackOptions {
  webhookUrl: string;
  /** Signs the outbound webhook (Standard Webhooks HMAC) when provided. */
  secret?: string;
}

export interface TickResult {
  checked: number;
  delivered: string[];
}

export interface OpenAIWebhookOptions {
  /** The OpenAI webhook signing secret (`whsec_…`). */
  signingSecret: string;
}

export interface BatchPoller {
  track: (target: TrackTarget, options: TrackOptions) => Promise<TrackedBatch>;
  tick: () => Promise<TickResult>;
  deliver: (record: TrackedBatch, snapshot: BatchSnapshot) => Promise<void>;
  openaiWebhookHandler: (
    options: OpenAIWebhookOptions
  ) => (request: Request) => Promise<Response>;
}

const EVENT_BY_STATUS: Partial<Record<BatchStatus, BatchWebhookEventType>> = {
  cancelled: "batch.cancelled",
  completed: "batch.completed",
  expired: "batch.expired",
  failed: "batch.failed",
};

const toEvent = (
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

/**
 * Create a managed poller: register submitted batches with `track`, then run
 * `tick` on a schedule (cron) to poll open batches and deliver one unified,
 * signed webhook per batch when it finishes. For OpenAI, mount
 * `openaiWebhookHandler` to skip polling and react to native webhooks instead.
 */
export const createBatchPoller = (options: BatchPollerOptions): BatchPoller => {
  const resolveCredentials = (provider: BatchProvider): ProviderCredentials => {
    if (typeof options.credentials === "function") {
      return options.credentials(provider);
    }
    return options.credentials ?? {};
  };

  const send = async (
    record: TrackedBatch,
    snapshot: BatchSnapshot
  ): Promise<void> => {
    const body = JSON.stringify(toEvent(record.provider, snapshot));
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (record.webhookSecret) {
      Object.assign(
        headers,
        await signWebhook(
          record.webhookSecret,
          record.id,
          body,
          Date.now() / 1000
        )
      );
    }
    const response = await fetch(record.webhookUrl, {
      body,
      headers,
      method: "POST",
    });
    if (!response.ok) {
      throw new BatchworkError(
        `batchwork: webhook delivery to ${record.webhookUrl} failed (${response.status}).`
      );
    }
  };

  const deliver = async (
    record: TrackedBatch,
    snapshot: BatchSnapshot
  ): Promise<void> => {
    await send(record, snapshot);
    await options.store.set({
      ...record,
      deliveredAt: new Date().toISOString(),
      status: snapshot.status,
    });
  };

  const track = async (
    target: TrackTarget,
    opts: TrackOptions
  ): Promise<TrackedBatch> => {
    const record: TrackedBatch = {
      createdAt: new Date().toISOString(),
      id: target.id,
      provider: target.provider,
      status: target.status ?? "in_progress",
      webhookSecret: opts.secret,
      webhookUrl: opts.webhookUrl,
    };
    await options.store.set(record);
    return record;
  };

  const tick = async (): Promise<TickResult> => {
    const pending = await options.store.list({ delivered: false });
    const delivered: string[] = [];
    for (const record of pending) {
      const adapter = getAdapter(record.provider);
      // oxlint-disable-next-line no-await-in-loop -- batches are polled serially.
      const snapshot = await adapter.retrieve(
        record.id,
        resolveCredentials(record.provider)
      );
      if (isTerminalStatus(snapshot.status)) {
        // oxlint-disable-next-line no-await-in-loop -- deliver before the next.
        await deliver(record, snapshot);
        delivered.push(record.id);
      } else if (snapshot.status !== record.status) {
        // oxlint-disable-next-line no-await-in-loop -- persist the status change.
        await options.store.set({ ...record, status: snapshot.status });
      }
    }
    return { checked: pending.length, delivered };
  };

  const openaiWebhookHandler =
    (config: OpenAIWebhookOptions) =>
    async (request: Request): Promise<Response> => {
      let verified: { body: string };
      try {
        verified = await verifyWebhook(request, config.signingSecret);
      } catch {
        return new Response("invalid signature", { status: 400 });
      }

      const payload = JSON.parse(verified.body) as {
        type?: string;
        data?: { id?: string };
      };
      if (!payload.type?.startsWith("batch.")) {
        return new Response("ignored", { status: 202 });
      }
      const id = payload.data?.id;
      if (!id) {
        return new Response("missing batch id", { status: 400 });
      }
      const record = await options.store.get(id);
      if (!record || record.deliveredAt) {
        return new Response("ok", { status: 200 });
      }
      const snapshot = await getAdapter("openai").retrieve(
        id,
        resolveCredentials("openai")
      );
      if (isTerminalStatus(snapshot.status)) {
        await deliver(record, snapshot);
      }
      return new Response("ok", { status: 200 });
    };

  return { deliver, openaiWebhookHandler, tick, track };
};
