import { Webhook, WebhookVerificationError } from "standardwebhooks";

import { BatchworkError } from "../errors";
import type { BatchWebhookEvent } from "./types";

// Standard Webhooks HMAC-SHA256 signing via the reference `standardwebhooks`
// implementation, compatible with OpenAI's webhook signatures (so the same
// verifier handles inbound OpenAI events and batchwork's own outbound
// deliveries). The library is pure JS, so it runs on edge runtimes.

const TOLERANCE_SECONDS = 300;
const SECRET_PREFIX = "whsec_";
const encoder = new TextEncoder();

/**
 * A `whsec_` secret is base64-encoded key material (the library decodes it);
 * anything else is used as raw UTF-8 bytes, matching OpenAI's conventions.
 */
const createWebhook = (secret: string): Webhook =>
  secret.startsWith(SECRET_PREFIX)
    ? new Webhook(secret)
    : new Webhook(encoder.encode(secret), { format: "raw" });

export interface WebhookReplayStore {
  claim?: (
    id: string,
    expiresAt: number,
    now: number
  ) => boolean | Promise<boolean>;
  get: (id: string) => number | Promise<number | undefined> | undefined;
  set: (id: string, expiresAt: number) => Promise<void> | void;
}

export interface VerifyWebhookOptions {
  replayStore?: WebhookReplayStore;
}

const replayCache = new Map<string, number>();
const replayLocks = new WeakMap<
  WebhookReplayStore,
  Map<string, Promise<void>>
>();

const pruneReplayCache = (now: number): void => {
  for (const [id, expiresAt] of replayCache) {
    if (expiresAt <= now) {
      replayCache.delete(id);
    }
  }
};

const defaultReplayStore: WebhookReplayStore = {
  claim: (id, expiresAt, now) => {
    pruneReplayCache(now);
    const existing = replayCache.get(id);
    if (existing && existing > now) {
      return false;
    }
    replayCache.set(id, expiresAt);
    return true;
  },
  get: (id) => replayCache.get(id),
  set: (id, expiresAt) => {
    replayCache.set(id, expiresAt);
  },
};

const withReplayLock = async <Result>(
  store: WebhookReplayStore,
  id: string,
  task: () => Promise<Result>
): Promise<Result> => {
  let locks = replayLocks.get(store);
  if (!locks) {
    locks = new Map();
    replayLocks.set(store, locks);
  }

  const previous = locks.get(id);
  let release!: () => void;
  // oxlint-disable-next-line promise/avoid-new -- a per-id lock needs a deferred release signal.
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  locks.set(id, current);

  if (previous) {
    await previous;
  }
  try {
    return await task();
  } finally {
    release();
    if (locks.get(id) === current) {
      locks.delete(id);
    }
  }
};

const rememberWebhookId = async (
  id: string,
  timestamp: number,
  now: number,
  store: WebhookReplayStore
): Promise<void> => {
  const expiresAt = timestamp + TOLERANCE_SECONDS;
  if (store.claim) {
    const claimed = await store.claim(id, expiresAt, now);
    if (!claimed) {
      throw new BatchworkError("batchwork: webhook replay detected.");
    }
    return;
  }

  await withReplayLock(store, id, async () => {
    if (store === defaultReplayStore) {
      pruneReplayCache(now);
    }
    const existing = await store.get(id);
    if (existing && existing > now) {
      throw new BatchworkError("batchwork: webhook replay detected.");
    }
    await store.set(id, expiresAt);
  });
};

/** Build Standard Webhooks signature headers for an outbound delivery. */
export const signWebhook = (
  secret: string,
  id: string,
  body: string,
  timestampSeconds: number
): Promise<Record<string, string>> => {
  const timestamp = Math.floor(timestampSeconds);
  // `sign` returns the already version-prefixed signature (`v1,…`).
  const signature = createWebhook(secret).sign(
    id,
    new Date(timestamp * 1000),
    body
  );
  return Promise.resolve({
    "webhook-id": id,
    "webhook-signature": signature,
    "webhook-timestamp": timestamp.toString(),
  });
};

export interface VerifiedWebhook {
  id: string;
  timestamp: number;
  body: string;
}

/**
 * Verify a Standard Webhooks-signed request and return its raw body. Throws if
 * headers are missing, the timestamp is outside tolerance, or no signature
 * matches. Consumes the request body.
 */
export const verifyWebhook = async (
  request: Request,
  secret: string,
  options?: VerifyWebhookOptions
): Promise<VerifiedWebhook> => {
  const id = request.headers.get("webhook-id");
  const timestamp = request.headers.get("webhook-timestamp");
  const signatureHeader = request.headers.get("webhook-signature");
  if (!(id && timestamp && signatureHeader)) {
    throw new BatchworkError("batchwork: missing webhook signature headers.");
  }

  const seconds = Number(timestamp);
  const now = Date.now() / 1000;
  if (
    !Number.isFinite(seconds) ||
    Math.abs(now - seconds) > TOLERANCE_SECONDS
  ) {
    throw new BatchworkError("batchwork: webhook timestamp outside tolerance.");
  }

  const body = await request.text();
  try {
    createWebhook(secret).verify(body, {
      "webhook-id": id,
      "webhook-signature": signatureHeader,
      "webhook-timestamp": timestamp,
    });
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      // The library re-checks the timestamp with the same tolerance; map its
      // failures onto the tolerance error above for a stable error surface.
      throw new BatchworkError(
        error.message.toLowerCase().includes("timestamp")
          ? "batchwork: webhook timestamp outside tolerance."
          : "batchwork: webhook signature verification failed.",
        { cause: error }
      );
    }
    // Any other error means the signature verified but the library's trailing
    // `JSON.parse` of the payload failed. `verifyWebhook` returns the raw body
    // and does not require JSON, so a non-JSON body is not an error here.
  }

  await rememberWebhookId(
    id,
    seconds,
    now,
    options?.replayStore ?? defaultReplayStore
  );

  return { body, id, timestamp: seconds };
};

/**
 * Verify and parse a batchwork webhook on your receiving endpoint. Returns the
 * unified {@link BatchWebhookEvent}.
 */
export const verifyBatchWebhook = async (
  request: Request,
  secret: string,
  options?: VerifyWebhookOptions
): Promise<BatchWebhookEvent> => {
  const { body } = await verifyWebhook(request, secret, options);
  return JSON.parse(body) as BatchWebhookEvent;
};
