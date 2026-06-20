/**
 * Shared driver for the live provider tests in this directory.
 *
 * Unlike the suite under `test/` (which mocks the transport), these tests hit
 * real provider batch APIs using credentials from the environment, submit 20
 * records, wait for completion, and assert the whole round-trip works — the
 * point is to surface runtime issues that mocks can't.
 *
 * They are excluded from the default `bun test` (scoped to `./test`). Run them
 * explicitly with `bun run test:live`. See `./README.md`.
 */
import { expect } from "bun:test";

import type { EmbeddingModel, ImageModel, LanguageModel } from "ai";

import { batch, batchEmbeddings, batchImages } from "../src/index";
import type {
  BatchEmbeddingRequest,
  BatchImageRequest,
  BatchRequest,
  BatchResult,
} from "../src/types";

/** Number of records submitted per live batch. */
export const LIVE_RECORD_COUNT = 20;

/** Image generation is pricier and slower; submit fewer records. */
export const LIVE_IMAGE_RECORD_COUNT = 4;

/**
 * Deadline passed to `job.wait()`, after which it throws a descriptive error.
 * Batches can take a while; default 30 minutes. Override per run.
 */
export const LIVE_WAIT_TIMEOUT_MS = Number(
  process.env.BATCHWORK_LIVE_TIMEOUT_MS ?? 30 * 60 * 1000
);

/**
 * Per-test timeout for `bun test`. Kept a touch above the wait deadline so the
 * wait's descriptive error wins the race over Bun's blunt "timed out".
 */
export const LIVE_TEST_TIMEOUT_MS = LIVE_WAIT_TIMEOUT_MS + 30_000;

const POLL_INTERVAL_MS = Number(process.env.BATCHWORK_LIVE_POLL_MS ?? 10_000);

const log = (message: string): void => {
  process.stdout.write(`${message}\n`);
};

const customIds = (): string[] =>
  Array.from({ length: LIVE_RECORD_COUNT }, (_, index) => `live-${index}`);

const buildRequests = (ids: string[]): BatchRequest[] =>
  ids.map((customId, index) => ({
    customId,
    maxOutputTokens: 16,
    prompt: `Reply with only the number and nothing else: what is ${index} + 1?`,
  }));

const summarize = (results: BatchResult[]): string => {
  const counts: Record<string, number> = {};
  for (const result of results) {
    counts[result.status] = (counts[result.status] ?? 0) + 1;
  }
  return JSON.stringify(counts);
};

/**
 * Submit a 20-record batch to a live provider, wait for it to finish, and
 * assert every record round-trips. Logs progress so any runtime issue surfaces
 * in the test output.
 */
export const runLiveBatch = async (
  label: string,
  model: LanguageModel
): Promise<void> => {
  const ids = customIds();
  const requests = buildRequests(ids);

  log(`[${label}] submitting ${requests.length} records…`);
  const job = await batch({ model, requests });
  log(`[${label}] submitted ${job.id} (${job.provider})`);
  expect(job.id).toBeTruthy();

  const snapshot = await job.wait({
    onPoll: (poll) =>
      log(`[${label}] ${poll.status} ${JSON.stringify(poll.requestCounts)}`),
    pollIntervalMs: POLL_INTERVAL_MS,
    timeoutMs: LIVE_WAIT_TIMEOUT_MS,
  });
  expect(snapshot.status).toBe("completed");

  const results = await job.collect();
  log(`[${label}] results: ${summarize(results)}`);

  const errored = results.filter((result) => result.status === "errored");
  for (const result of errored) {
    log(
      `[${label}] ${result.customId} errored: ${JSON.stringify(result.error)}`
    );
  }

  // Every submitted record must come back, correlated by its customId.
  const seen = new Set(results.map((result) => result.customId));
  expect(seen.size).toBe(LIVE_RECORD_COUNT);
  for (const id of ids) {
    expect(seen.has(id)).toBe(true);
  }

  // The whole point is "no runtime issues": every record should succeed and
  // expose normalized text.
  expect(errored).toHaveLength(0);
  const sample = results.find((result) => result.status === "succeeded");
  expect(sample?.text).toBeTruthy();
  log(`[${label}] sample ${sample?.customId}: ${sample?.text?.trim()}`);
};

const buildEmbeddingRequests = (ids: string[]): BatchEmbeddingRequest[] =>
  ids.map((customId, index) => ({
    customId,
    value: `Sentence number ${index} to embed for the live batch test.`,
  }));

/**
 * Submit a 20-record embedding batch to a live provider, wait for it to finish,
 * and assert every record round-trips with a non-empty vector.
 */
export const runLiveEmbeddings = async (
  label: string,
  model: EmbeddingModel
): Promise<void> => {
  const ids = customIds();
  const requests = buildEmbeddingRequests(ids);

  log(`[${label}] submitting ${requests.length} embedding records…`);
  const job = await batchEmbeddings({ model, requests });
  log(`[${label}] submitted ${job.id} (${job.provider})`);
  expect(job.id).toBeTruthy();

  const snapshot = await job.wait({
    onPoll: (poll) =>
      log(`[${label}] ${poll.status} ${JSON.stringify(poll.requestCounts)}`),
    pollIntervalMs: POLL_INTERVAL_MS,
    timeoutMs: LIVE_WAIT_TIMEOUT_MS,
  });
  expect(snapshot.status).toBe("completed");

  const results = await job.collect();
  log(`[${label}] results: ${summarize(results)}`);

  const errored = results.filter((result) => result.status === "errored");
  for (const result of errored) {
    log(
      `[${label}] ${result.customId} errored: ${JSON.stringify(result.error)}`
    );
  }

  const seen = new Set(results.map((result) => result.customId));
  expect(seen.size).toBe(LIVE_RECORD_COUNT);
  for (const id of ids) {
    expect(seen.has(id)).toBe(true);
  }

  expect(errored).toHaveLength(0);
  const sample = results.find((result) => result.status === "succeeded");
  expect(sample?.embedding?.length).toBeGreaterThan(0);
  log(
    `[${label}] sample ${sample?.customId}: ${sample?.embedding?.length} dims`
  );
};

const buildImageRequests = (ids: string[]): BatchImageRequest[] =>
  ids.map((customId, index) => ({
    customId,
    prompt: `A minimalist flat-color icon of the number ${index}.`,
  }));

/**
 * Submit a small image-generation batch to a live provider, wait for it to
 * finish, and assert every record round-trips with at least one base64 image.
 */
export const runLiveImages = async (
  label: string,
  model: ImageModel
): Promise<void> => {
  const ids = Array.from(
    { length: LIVE_IMAGE_RECORD_COUNT },
    (_, index) => `live-${index}`
  );
  const requests = buildImageRequests(ids);

  log(`[${label}] submitting ${requests.length} image records…`);
  const job = await batchImages({ model, requests });
  log(`[${label}] submitted ${job.id} (${job.provider})`);
  expect(job.id).toBeTruthy();

  const snapshot = await job.wait({
    onPoll: (poll) =>
      log(`[${label}] ${poll.status} ${JSON.stringify(poll.requestCounts)}`),
    pollIntervalMs: POLL_INTERVAL_MS,
    timeoutMs: LIVE_WAIT_TIMEOUT_MS,
  });
  expect(snapshot.status).toBe("completed");

  const results = await job.collect();
  log(`[${label}] results: ${summarize(results)}`);

  const errored = results.filter((result) => result.status === "errored");
  for (const result of errored) {
    log(
      `[${label}] ${result.customId} errored: ${JSON.stringify(result.error)}`
    );
  }

  const seen = new Set(results.map((result) => result.customId));
  expect(seen.size).toBe(LIVE_IMAGE_RECORD_COUNT);
  for (const id of ids) {
    expect(seen.has(id)).toBe(true);
  }

  expect(errored).toHaveLength(0);
  const sample = results.find((result) => result.status === "succeeded");
  expect(sample?.images?.length).toBeGreaterThan(0);
  // Inline base64 (`data`) or a hosted URL (`url`, e.g. xAI batch) — either works.
  const image = sample?.images?.[0];
  expect(image?.data ?? image?.url).toBeTruthy();
  log(
    `[${label}] sample ${sample?.customId}: ${sample?.images?.length} image(s), ${image?.mediaType ?? image?.url ?? "?"}`
  );
};
