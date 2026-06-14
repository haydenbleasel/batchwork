import { getBatchResults } from "../batch";
import { toEvent } from "../server/events";
import { createBatchPoller } from "../server/poller";
import type {
  CompletionSink,
  CredentialResolver,
  TrackTarget,
} from "../server/poller";
import { createMemoryStore } from "../server/store";
import type {
  BatchStore,
  BatchWebhookEvent,
  TrackedBatch,
} from "../server/types";
import type { BatchProvider, BatchResult, ProviderCredentials } from "../types";

export { createMemoryStore };
export type {
  BatchStore,
  BatchWebhookEvent,
  BatchResult,
  TrackedBatch,
  TrackTarget,
};

/**
 * Invoked once per batch when it reaches a terminal status. Persist the results
 * to your database here. `results` streams the parsed result lines for a
 * completed batch and is empty for failure events (`batch.failed` /
 * `batch.expired` / `batch.cancelled`) — inspect `event.type`.
 *
 * May fire more than once for the same batch (a cron tick racing the OpenAI
 * native webhook, or a retry after a partial save), so make persistence
 * idempotent — upsert keyed by `(provider, batchId, customId)`.
 */
export type OnBatchComplete = (
  event: BatchWebhookEvent,
  results: AsyncIterable<BatchResult>
) => void | Promise<void>;

export interface BatchRoutesOptions {
  store: BatchStore;
  /** Called when each batch finishes; persist results here. */
  onComplete: OnBatchComplete;
  /** Falls back to provider env vars (e.g. `OPENAI_API_KEY`) when omitted. */
  credentials?: CredentialResolver;
  /** When set, the cron `GET` requires `Authorization: Bearer <cronSecret>`. */
  cronSecret?: string;
  /** When set, mounts an OpenAI native-webhook handler on `POST`. */
  openaiSigningSecret?: string;
  /** Observe per-batch processing errors during a tick; the tick continues. */
  onError?: (record: TrackedBatch, error: unknown) => void;
}

export interface BatchRoutes {
  /** Cron-triggered poll tick. Wire to Vercel Cron (or any scheduler). */
  GET: (request: Request) => Promise<Response>;
  /** OpenAI native-webhook handler. Present only with `openaiSigningSecret`. */
  POST?: (request: Request) => Promise<Response>;
  /** Register a submitted batch so the cron polls it (a `BatchJob` works). */
  track: (target: TrackTarget) => Promise<TrackedBatch>;
}

/** An already-exhausted async iterable, for non-completed events. */
const EMPTY_RESULTS: AsyncIterable<BatchResult> = {
  [Symbol.asyncIterator]: () => ({
    next: () => Promise.resolve({ done: true, value: undefined }),
  }),
};

/**
 * Build Next.js App Router route handlers that poll your in-flight batches on a
 * cron tick and invoke `onComplete` directly when each finishes — persist
 * results to your DB without round-tripping an HTTP webhook back to your app.
 *
 * @example
 * import { createBatchRoutes, createMemoryStore } from "batchwork/next";
 *
 * export const { GET, POST } = createBatchRoutes({
 *   store: createMemoryStore(),
 *   cronSecret: process.env.CRON_SECRET,
 *   openaiSigningSecret: process.env.OPENAI_WEBHOOK_SECRET,
 *   onComplete: async (event, results) => {
 *     for await (const r of results) {
 *       await db.insert({ id: r.customId, status: r.status, text: r.text });
 *     }
 *   },
 * });
 */
export const createBatchRoutes = (options: BatchRoutesOptions): BatchRoutes => {
  const resolveCredentials = (provider: BatchProvider): ProviderCredentials => {
    if (typeof options.credentials === "function") {
      return options.credentials(provider);
    }
    return options.credentials ?? {};
  };

  const sink: CompletionSink = async (record, snapshot) => {
    const event = toEvent(record.provider, snapshot);
    // Only completed batches have results to fetch — the adapter throws when a
    // terminal batch has no output/error file (failed/expired/cancelled).
    const results =
      event.type === "batch.completed"
        ? getBatchResults({
            id: record.id,
            provider: record.provider,
            ...resolveCredentials(record.provider),
          })
        : EMPTY_RESULTS;
    await options.onComplete(event, results);
  };

  const poller = createBatchPoller({
    credentials: options.credentials,
    onComplete: sink,
    // Always supply an `onError` so one failing batch can't abort the whole
    // tick; forward to the caller's handler when they provided one.
    onError: (record, error) => options.onError?.(record, error),
    store: options.store,
  });

  const GET = (request: Request): Promise<Response> => {
    if (
      options.cronSecret &&
      request.headers.get("authorization") !== `Bearer ${options.cronSecret}`
    ) {
      return Promise.resolve(new Response("unauthorized", { status: 401 }));
    }
    return poller.tick().then((result) => Response.json(result));
  };

  const track = (target: TrackTarget): Promise<TrackedBatch> =>
    poller.track(target, {});

  const routes: BatchRoutes = { GET, track };
  if (options.openaiSigningSecret) {
    routes.POST = poller.openaiWebhookHandler({
      signingSecret: options.openaiSigningSecret,
    });
  }
  return routes;
};
