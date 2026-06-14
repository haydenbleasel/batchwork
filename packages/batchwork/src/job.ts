import { BatchworkError } from "./errors";
import type { BatchAdapter } from "./providers/adapter";
import type {
  BatchProvider,
  BatchRequestCounts,
  BatchResult,
  BatchSnapshot,
  BatchStatus,
  ProviderCredentials,
  WaitOptions,
} from "./types";

const DEFAULT_POLL_INTERVAL_MS = 15_000;

const TERMINAL_STATUSES: ReadonlySet<BatchStatus> = new Set<BatchStatus>([
  "completed",
  "failed",
  "expired",
  "cancelled",
]);

/** Whether a status means the batch has finished processing. */
export function isTerminalStatus(status: BatchStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new BatchworkError("batchwork: wait aborted."));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new BatchworkError("batchwork: wait aborted."));
      },
      { once: true }
    );
  });
}

/**
 * A handle to a submitted batch. Returned by `batch()` and `getBatch()`. Use it
 * to poll status, wait for completion, stream results, or cancel.
 */
export class BatchJob {
  readonly provider: BatchProvider;
  readonly id: string;

  readonly #adapter: BatchAdapter;
  readonly #credentials: ProviderCredentials;
  #snapshot: BatchSnapshot;

  constructor(
    adapter: BatchAdapter,
    credentials: ProviderCredentials,
    snapshot: BatchSnapshot
  ) {
    this.#adapter = adapter;
    this.#credentials = credentials;
    this.#snapshot = snapshot;
    this.id = snapshot.id;
    this.provider = snapshot.provider;
  }

  /** The most recently observed status. */
  get status(): BatchStatus {
    return this.#snapshot.status;
  }

  /** The most recently observed per-request tallies. */
  get requestCounts(): BatchRequestCounts {
    return this.#snapshot.requestCounts;
  }

  /** The most recently observed snapshot. */
  get snapshot(): BatchSnapshot {
    return this.#snapshot;
  }

  /** Refresh the status from the provider and return the new snapshot. */
  async poll(): Promise<BatchSnapshot> {
    this.#snapshot = await this.#adapter.retrieve(this.id, this.#credentials);
    return this.#snapshot;
  }

  /** Poll until the batch reaches a terminal status, then return the snapshot. */
  async wait(options: WaitOptions = {}): Promise<BatchSnapshot> {
    const interval = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const deadline = options.timeoutMs
      ? Date.now() + options.timeoutMs
      : undefined;

    let snapshot = await this.poll();
    options.onPoll?.(snapshot);

    while (!isTerminalStatus(snapshot.status)) {
      if (options.signal?.aborted) {
        throw new BatchworkError("batchwork: wait aborted.");
      }
      if (deadline !== undefined && Date.now() > deadline) {
        throw new BatchworkError(
          `batchwork: timed out waiting for batch "${this.id}".`
        );
      }
      await delay(interval, options.signal);
      snapshot = await this.poll();
      options.onPoll?.(snapshot);
    }

    return snapshot;
  }

  /** Stream normalized results as they are read. Order is not guaranteed. */
  results(): AsyncGenerator<BatchResult> {
    return this.#adapter.results(this.id, this.#credentials);
  }

  /** Collect all results into an array, keyed by `customId`. */
  async collect(): Promise<BatchResult[]> {
    const out: BatchResult[] = [];
    for await (const result of this.results()) {
      out.push(result);
    }
    return out;
  }

  /** Request cancellation, then refresh status. */
  async cancel(): Promise<BatchSnapshot> {
    await this.#adapter.cancel(this.id, this.#credentials);
    return await this.poll();
  }
}
