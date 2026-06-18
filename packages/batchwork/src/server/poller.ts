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

export type WebhookUrlValidator = (url: URL) => void | Promise<void>;

export interface BatchPollerOptions {
  store: BatchStore;
  /** Falls back to provider env vars (e.g. `OPENAI_API_KEY`) when omitted. */
  credentials?: CredentialResolver;
  /** Replaces signed-webhook delivery when a batch finishes. */
  onComplete?: CompletionSink;
  /** Override the default webhook URL policy with an application allowlist. */
  validateWebhookUrl?: WebhookUrlValidator;
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

const parseIpv4 = (host: string): number[] | undefined => {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(host)) {
    return;
  }
  const parts = host.split(".").map(Number);
  const valid = parts.every(
    (part) => Number.isInteger(part) && part >= 0 && part <= 255
  );
  return valid ? parts : undefined;
};

const isPrivateIpv4 = (parts: number[]): boolean => {
  const [a = 0, b = 0] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
};

const parseIpv4MappedIpv6 = (host: string): number[] | undefined => {
  const normalized = host.replace(/^\[/u, "").replace(/\]$/u, "").toLowerCase();
  if (!normalized.startsWith("::ffff:")) {
    return;
  }

  const suffix = normalized.slice("::ffff:".length);
  const dotted = parseIpv4(suffix);
  if (dotted) {
    return dotted;
  }

  const [high, low, extra] = suffix.split(":");
  if (!(high && low) || extra !== undefined) {
    return;
  }
  const highBits = Number.parseInt(high, 16);
  const lowBits = Number.parseInt(low, 16);
  if (
    !Number.isInteger(highBits) ||
    !Number.isInteger(lowBits) ||
    highBits < 0 ||
    highBits > 65_535 ||
    lowBits < 0 ||
    lowBits > 65_535
  ) {
    return;
  }
  return [
    Math.floor(highBits / 256),
    highBits % 256,
    Math.floor(lowBits / 256),
    lowBits % 256,
  ];
};

const isPrivateIpv6 = (host: string): boolean => {
  const normalized = host.replace(/^\[/u, "").replace(/\]$/u, "").toLowerCase();
  // Only an IPv6 literal can be a private address, and one always contains a
  // colon — guard so a bare DNS name like `fc2.com` is not mistaken for `fc00::/7`.
  if (!normalized.includes(":")) {
    return false;
  }
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
};

const isRedirectStatus = (status: number): boolean =>
  status >= 300 && status < 400;

const assertSafeWebhookUrl: WebhookUrlValidator = (url) => {
  if (url.protocol !== "https:") {
    throw new BatchworkError("batchwork: webhookUrl must use https.");
  }
  if (url.username || url.password) {
    throw new BatchworkError(
      "batchwork: webhookUrl must not include credentials."
    );
  }

  const host = url.hostname.toLowerCase();
  const ipv4 = parseIpv4(host);
  const mappedIpv4 = parseIpv4MappedIpv6(host);
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    (ipv4 && isPrivateIpv4(ipv4)) ||
    (mappedIpv4 && isPrivateIpv4(mappedIpv4)) ||
    isPrivateIpv6(host)
  ) {
    throw new BatchworkError(
      "batchwork: webhookUrl must not target localhost or private networks."
    );
  }
};

const validateWebhookUrl = async (
  rawUrl: string,
  validator: WebhookUrlValidator
): Promise<string> => {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch (error) {
    throw new BatchworkError("batchwork: webhookUrl must be a valid URL.", {
      cause: error,
    });
  }
  await validator(url);
  return url.toString();
};

/** The default completion sink: POST a signed webhook to the tracked URL. */
const createWebhookSink =
  (validator: WebhookUrlValidator): CompletionSink =>
  async (record, snapshot) => {
    if (!record.webhookUrl) {
      throw new BatchworkError(
        "batchwork: tracked batch has no webhookUrl to deliver to."
      );
    }
    const webhookUrl = await validateWebhookUrl(record.webhookUrl, validator);
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
    const response = await fetch(webhookUrl, {
      body,
      headers,
      method: "POST",
      redirect: "manual",
    });
    if (isRedirectStatus(response.status)) {
      throw new BatchworkError(
        `batchwork: webhook delivery to ${webhookUrl} redirected (${response.status}).`
      );
    }
    if (!response.ok) {
      throw new BatchworkError(
        `batchwork: webhook delivery to ${webhookUrl} failed (${response.status}).`
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

  const webhookUrlValidator =
    options.validateWebhookUrl ?? assertSafeWebhookUrl;
  const sink = options.onComplete ?? createWebhookSink(webhookUrlValidator);

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
    const webhookUrl =
      opts.webhookUrl && !options.onComplete
        ? await validateWebhookUrl(opts.webhookUrl, webhookUrlValidator)
        : opts.webhookUrl;
    const record: TrackedBatch = {
      createdAt: new Date().toISOString(),
      id: target.id,
      provider: target.provider,
      status: target.status ?? "in_progress",
      webhookSecret: opts.secret,
      webhookUrl,
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
