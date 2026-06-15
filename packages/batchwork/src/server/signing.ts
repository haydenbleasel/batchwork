import { BatchworkError } from "../errors";
import type { BatchWebhookEvent } from "./types";

// Standard Webhooks-style HMAC-SHA256 signing, compatible with OpenAI's webhook
// signatures (so the same verifier handles inbound OpenAI events and batchwork's
// own outbound deliveries). Uses Web Crypto so it runs on edge runtimes.

const SIGNATURE_VERSION = "v1";
const TOLERANCE_SECONDS = 300;
const SECRET_PREFIX = "whsec_";
const encoder = new TextEncoder();

export interface WebhookReplayStore {
  get: (id: string) => number | Promise<number | undefined> | undefined;
  set: (id: string, expiresAt: number) => Promise<void> | void;
}

export interface VerifyWebhookOptions {
  replayStore?: WebhookReplayStore;
}

const replayCache = new Map<string, number>();

const defaultReplayStore: WebhookReplayStore = {
  get: (id) => replayCache.get(id),
  set: (id, expiresAt) => {
    replayCache.set(id, expiresAt);
  },
};

const pruneReplayCache = (now: number): void => {
  for (const [id, expiresAt] of replayCache) {
    if (expiresAt <= now) {
      replayCache.delete(id);
    }
  }
};

const base64ToBytes = (value: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(value), (char) => char.codePointAt(0) ?? 0);

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }
  return btoa(binary);
};

const importKey = (secret: string): Promise<CryptoKey> => {
  const raw = secret.startsWith(SECRET_PREFIX)
    ? base64ToBytes(secret.slice(SECRET_PREFIX.length))
    : encoder.encode(secret);
  return crypto.subtle.importKey(
    "raw",
    raw,
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign", "verify"]
  );
};

const signContent = async (
  secret: string,
  content: string
): Promise<string> => {
  const key = await importKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(content)
  );
  return bytesToBase64(new Uint8Array(signature));
};

const verifyContent = async (
  secret: string,
  content: string,
  signature: string
): Promise<boolean> => {
  const key = await importKey(secret);
  return crypto.subtle.verify(
    "HMAC",
    key,
    base64ToBytes(signature),
    encoder.encode(content)
  );
};

const rememberWebhookId = async (
  id: string,
  timestamp: number,
  now: number,
  store: WebhookReplayStore
): Promise<void> => {
  if (store === defaultReplayStore) {
    pruneReplayCache(now);
  }
  const expiresAt = await store.get(id);
  if (expiresAt && expiresAt > now) {
    throw new BatchworkError("batchwork: webhook replay detected.");
  }
  await store.set(id, timestamp + TOLERANCE_SECONDS);
};

/** Build Standard Webhooks signature headers for an outbound delivery. */
export const signWebhook = async (
  secret: string,
  id: string,
  body: string,
  timestampSeconds: number
): Promise<Record<string, string>> => {
  const timestamp = Math.floor(timestampSeconds).toString();
  const signature = await signContent(secret, `${id}.${timestamp}.${body}`);
  return {
    "webhook-id": id,
    "webhook-signature": `${SIGNATURE_VERSION},${signature}`,
    "webhook-timestamp": timestamp,
  };
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
  const content = `${id}.${timestamp}.${body}`;
  const signatures = signatureHeader.split(" ").map((part) => {
    const comma = part.indexOf(",");
    return comma === -1 ? part : part.slice(comma + 1);
  });

  let valid = false;
  for (const signature of signatures) {
    // oxlint-disable-next-line no-await-in-loop -- usually a single signature.
    if (await verifyContent(secret, content, signature)) {
      valid = true;
      break;
    }
  }
  if (!valid) {
    throw new BatchworkError(
      "batchwork: webhook signature verification failed."
    );
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
