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

import type {
  EmbeddingModel,
  ImageModel,
  LanguageModel,
  TranscriptionModel,
} from "ai";

import { batch } from "../src/batch";
import type {
  BatchEmbeddingRequest,
  BatchImageEditRequest,
  BatchImageRequest,
  BatchModerationRequest,
  BatchRequest,
  BatchResult,
  BatchTranscriptionRequest,
  BatchTranslationRequest,
  BatchVideoRequest,
  VideoModel,
} from "../src/types";

/** Number of records submitted per live batch. */
export const LIVE_RECORD_COUNT = 20;

/** Image generation is pricier and slower; submit fewer records. */
export const LIVE_IMAGE_RECORD_COUNT = 4;

/** Transcription runs against one hosted sample; submit a few records. */
export const LIVE_TRANSCRIPTION_RECORD_COUNT = 4;

/**
 * A short public sample; batch audio endpoints fetch a hosted URL (no file
 * uploads), so the tests reuse this file for every record.
 */
export const LIVE_AUDIO_URL =
  process.env.BATCHWORK_LIVE_AUDIO_URL ??
  "https://github.com/voxserv/audio_quality_testing_samples/raw/refs/heads/master/testaudio/8000/test01_20s.wav";

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
  const job = await batch.embeddings({ model, requests });
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
  const job = await batch.images({ model, requests });
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

/**
 * A stable public source image for edit tests; batch edit bodies are JSON, so
 * the provider fetches this URL at execution time.
 */
export const LIVE_SOURCE_IMAGE_URL =
  process.env.BATCHWORK_LIVE_SOURCE_IMAGE_URL ??
  "https://picsum.photos/seed/batchwork/800/600";

const buildImageEditRequests = (ids: string[]): BatchImageEditRequest[] =>
  ids.map((customId, index) => ({
    customId,
    images: [{ imageUrl: LIVE_SOURCE_IMAGE_URL }],
    prompt: `Tint the whole image with a subtle color wash, variation ${index}.`,
  }));

/**
 * Submit a small image-edit batch to a live provider, wait for it to finish,
 * and assert every record round-trips with at least one edited image.
 */
export const runLiveImageEdits = async (
  label: string,
  model: ImageModel
): Promise<void> => {
  const ids = Array.from(
    { length: LIVE_IMAGE_RECORD_COUNT },
    (_, index) => `live-${index}`
  );
  const requests = buildImageEditRequests(ids);

  log(`[${label}] submitting ${requests.length} image-edit records…`);
  const job = await batch.images.edit({ model, requests });
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
  const image = sample?.images?.[0];
  expect(image?.data ?? image?.url).toBeTruthy();
  log(
    `[${label}] sample ${sample?.customId}: ${sample?.images?.length} image(s), ${image?.mediaType ?? image?.url ?? "?"}`
  );
};

/** Video generation is the priciest modality; submit the bare minimum. */
export const LIVE_VIDEO_RECORD_COUNT = 2;

const buildVideoRequests = (ids: string[]): BatchVideoRequest[] =>
  ids.map((customId, index) => ({
    customId,
    duration: 5,
    prompt: `A minimalist animation of the number ${index} spinning slowly.`,
  }));

/**
 * Submit a tiny video batch to a live provider, wait for it to finish, and
 * assert every record round-trips with a signed video URL.
 */
export const runLiveVideos = async (
  label: string,
  model: VideoModel
): Promise<void> => {
  const ids = Array.from(
    { length: LIVE_VIDEO_RECORD_COUNT },
    (_, index) => `live-${index}`
  );
  const requests = buildVideoRequests(ids);

  log(`[${label}] submitting ${requests.length} video records…`);
  const job = await batch.videos({ model, requests });
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
  expect(seen.size).toBe(LIVE_VIDEO_RECORD_COUNT);
  for (const id of ids) {
    expect(seen.has(id)).toBe(true);
  }

  expect(errored).toHaveLength(0);
  const sample = results.find((result) => result.status === "succeeded");
  // xAI batch returns signed URLs that expire ~1h after completion.
  expect(sample?.videos?.[0]?.url).toBeTruthy();
  log(
    `[${label}] sample ${sample?.customId}: ${sample?.videos?.[0]?.durationSeconds ?? "?"}s ${sample?.videos?.[0]?.url}`
  );
};

const buildTranslationRequests = (ids: string[]): BatchTranslationRequest[] =>
  ids.map((customId) => ({ audioUrl: LIVE_AUDIO_URL, customId }));

/**
 * Submit a small audio-translation batch to a live provider, wait for it to
 * finish, and assert every record round-trips with a non-empty English text.
 */
export const runLiveTranslations = async (
  label: string,
  model: TranscriptionModel
): Promise<void> => {
  const ids = Array.from(
    { length: LIVE_TRANSCRIPTION_RECORD_COUNT },
    (_, index) => `live-${index}`
  );
  const requests = buildTranslationRequests(ids);

  log(`[${label}] submitting ${requests.length} translation records…`);
  const job = await batch.translations({ model, requests });
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
  expect(seen.size).toBe(LIVE_TRANSCRIPTION_RECORD_COUNT);
  for (const id of ids) {
    expect(seen.has(id)).toBe(true);
  }

  expect(errored).toHaveLength(0);
  const sample = results.find((result) => result.status === "succeeded");
  expect(sample?.text).toBeTruthy();
  log(`[${label}] sample ${sample?.customId}: ${sample?.text?.trim()}`);
};

const buildModerationRequests = (ids: string[]): BatchModerationRequest[] =>
  ids.map((customId, index) => ({
    customId,
    value: `Benign sentence number ${index} about the weather being pleasant.`,
  }));

/**
 * Submit a 20-record moderation batch to a live provider, wait for it to
 * finish, and assert every record round-trips with a verdict.
 */
export const runLiveModerations = async (
  label: string,
  model: string
): Promise<void> => {
  const ids = customIds();
  const requests = buildModerationRequests(ids);

  log(`[${label}] submitting ${requests.length} moderation records…`);
  const job = await batch.moderations({ model, requests });
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
  // Benign inputs: a verdict must exist and should not be flagged.
  expect(sample?.moderation).toBeDefined();
  expect(sample?.moderation?.flagged).toBe(false);
  log(
    `[${label}] sample ${sample?.customId}: flagged=${sample?.moderation?.flagged}, ${Object.keys(sample?.moderation?.categories ?? {}).length} categories`
  );
};

const buildTranscriptionRequests = (
  ids: string[]
): BatchTranscriptionRequest[] =>
  ids.map((customId) => ({
    audioUrl: LIVE_AUDIO_URL,
    customId,
    language: "en",
  }));

/**
 * Submit a small transcription batch to a live provider, wait for it to
 * finish, and assert every record round-trips with a non-empty transcript.
 */
export const runLiveTranscriptions = async (
  label: string,
  model: TranscriptionModel
): Promise<void> => {
  const ids = Array.from(
    { length: LIVE_TRANSCRIPTION_RECORD_COUNT },
    (_, index) => `live-${index}`
  );
  const requests = buildTranscriptionRequests(ids);

  log(`[${label}] submitting ${requests.length} transcription records…`);
  const job = await batch.transcriptions({ model, requests });
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
  expect(seen.size).toBe(LIVE_TRANSCRIPTION_RECORD_COUNT);
  for (const id of ids) {
    expect(seen.has(id)).toBe(true);
  }

  expect(errored).toHaveLength(0);
  const sample = results.find((result) => result.status === "succeeded");
  expect(sample?.text).toBeTruthy();
  log(`[${label}] sample ${sample?.customId}: ${sample?.text?.trim()}`);
};
