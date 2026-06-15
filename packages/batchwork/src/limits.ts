import { BatchworkError } from "./errors";
import type { BatchLimits } from "./types";

export interface ResolvedBatchLimits {
  captureConcurrency: number;
  maxRequests: number;
  maxRequestBytes: number;
  maxUploadBytes: number;
}

const DEFAULT_LIMITS: ResolvedBatchLimits = {
  captureConcurrency: 16,
  maxRequestBytes: 20 * 1024 * 1024,
  maxRequests: 50_000,
  maxUploadBytes: 200 * 1024 * 1024,
};

const encoder = new TextEncoder();

const positiveInteger = (name: string, value: number): number => {
  if (!(Number.isInteger(value) && value > 0)) {
    throw new BatchworkError(
      `batchwork: limits.${name} must be a positive integer.`
    );
  }
  return value;
};

export const resolveBatchLimits = (
  limits: BatchLimits | undefined
): ResolvedBatchLimits => ({
  captureConcurrency: positiveInteger(
    "captureConcurrency",
    limits?.captureConcurrency ?? DEFAULT_LIMITS.captureConcurrency
  ),
  maxRequestBytes: positiveInteger(
    "maxRequestBytes",
    limits?.maxRequestBytes ?? DEFAULT_LIMITS.maxRequestBytes
  ),
  maxRequests: positiveInteger(
    "maxRequests",
    limits?.maxRequests ?? DEFAULT_LIMITS.maxRequests
  ),
  maxUploadBytes: positiveInteger(
    "maxUploadBytes",
    limits?.maxUploadBytes ?? DEFAULT_LIMITS.maxUploadBytes
  ),
});

export const byteLength = (value: string): number =>
  encoder.encode(value).length;

export const assertByteLength = (
  label: string,
  value: string,
  maxBytes: number
): void => {
  const bytes = byteLength(value);
  if (bytes > maxBytes) {
    throw new BatchworkError(
      `batchwork: ${label} is ${bytes} bytes, exceeding the ${maxBytes} byte limit.`
    );
  }
};

export const mapWithConcurrency = async <Input, Output>(
  items: readonly Input[],
  concurrency: number,
  mapper: (item: Input) => Promise<Output>
): Promise<Output[]> => {
  const results = [] as Output[];
  results.length = items.length;
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);

  const runNext = async (): Promise<void> => {
    const index = nextIndex;
    nextIndex += 1;
    if (index >= items.length) {
      return;
    }
    results[index] = await mapper(items[index] as Input);
    await runNext();
  };

  await Promise.all(Array.from({ length: workerCount }, () => runNext()));
  return results;
};
