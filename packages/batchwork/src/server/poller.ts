import { BatchworkError } from "../errors";
import { isTerminalStatus } from "../job";
import { getAdapter } from "../providers";
import type {
  BatchProvider,
  BatchSnapshot,
  BatchStatus,
  ProviderCredentials,
} from "../types";
import { toEvent } from "./events";
import { signWebhook, verifyWebhook } from "./signing";
import type { BatchStore, TrackedBatch } from "./types";

/** Credentials for polling: a fixed config, or one resolved per provider. */
export type CredentialResolver =
  | ProviderCredentials
  | ((provider: BatchProvider) => ProviderCredentials);

/**
 * Handles a batch reaching a terminal status. Replaces the default signed
 * webhook delivery — e.g. to invoke a callback instead (see `batchwork/next`).
 */
export type CompletionSink = (
  record: TrackedBatch,
  snapshot: BatchSnapshot
) => Promise<void>;

export interface BatchPollerOptions {
  store: BatchStore;
  /** Falls back to provider env vars (e.g. `OPENAI_API_KEY`) when omitted. */
  credentials?: CredentialResolver;
  /** Replaces signed-webhook delivery when a batch finishes. */
  onComplete?: CompletionSink;
  /**
   * Called when processing a single batch throws during `tick`. When provided,
   * the tick reports the error and continues to the next batch; when omitted,
   * the error propagates out of `tick`.
   */
  onError?: (record: TrackedBatch, error: unknown) => void;
}

export interface TrackTarget {
  id: string;
  provider: BatchProvider;
  status?: BatchStatus;
}

export interface TrackOptions {
  /** Where to POST the completion webhook. Omit for callback-based delivery. */
  webhookUrl?: string;
  /** Signs the outbound webhook (Standard Webhooks HMAC) when provided. */
  secret?: string;
}

export interface TickResult {
  checked: number;
  delivered: string[];
  /** Batches whose processing threw this tick (only when `onError` is set). */
  failed?: { id: string; error: string }[];
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

/** The default completion sink: POST a signed webhook to the tracked URL. */
const sendWebhook: CompletionSink = async (record, snapshot) => {
  if (!record.webhookUrl) {
    throw new BatchworkError(
      "batchwork: tracked batch has no webhookUrl to deliver to."
    );
  }
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

  const sink = options.onComplete ?? sendWebhook;

  const deliver = async (
    record: TrackedBatch,
    snapshot: BatchSnapshot
  ): Promise<void> => {
    // Run the side effect before marking delivered: if it throws, the record
    // stays pending and is retried on the next tick (at-least-once delivery).
    await sink(record, snapshot);
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

  const process = async (
    record: TrackedBatch,
    delivered: string[]
  ): Promise<void> => {
    const adapter = getAdapter(record.provider);
    const snapshot = await adapter.retrieve(
      record.id,
      resolveCredentials(record.provider)
    );
    if (isTerminalStatus(snapshot.status)) {
      await deliver(record, snapshot);
      delivered.push(record.id);
    } else if (snapshot.status !== record.status) {
      await options.store.set({ ...record, status: snapshot.status });
    }
  };

  const tick = async (): Promise<TickResult> => {
    const pending = await options.store.list({ delivered: false });
    const delivered: string[] = [];
    const failed: { id: string; error: string }[] = [];
    for (const record of pending) {
      // oxlint-disable-next-line no-await-in-loop -- batches are polled serially
      // to avoid hammering provider rate limits; deliver before the next.
      try {
        // oxlint-disable-next-line no-await-in-loop -- see above.
        await process(record, delivered);
      } catch (error) {
        // Without an `onError` handler, preserve the propagate-the-throw
        // behavior; with one, report and continue so a single failing batch
        // can't starve the rest of the queue. Either way the record stays
        // pending (it was never marked delivered) and retries next tick.
        if (!options.onError) {
          throw error;
        }
        options.onError(record, error);
        failed.push({
          error: error instanceof Error ? error.message : String(error),
          id: record.id,
        });
      }
    }
    return failed.length > 0
      ? { checked: pending.length, delivered, failed }
      : { checked: pending.length, delivered };
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
