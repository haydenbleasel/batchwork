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

export const assertByteCount = (
  label: string,
  bytes: number,
  maxBytes: number
): void => {
  if (bytes > maxBytes) {
    throw new BatchworkError(
      `batchwork: ${label} is ${bytes} bytes, exceeding the ${maxBytes} byte limit.`
    );
  }
};

export const assertByteLength = (
  label: string,
  value: string,
  maxBytes: number
): void => {
  assertByteCount(label, byteLength(value), maxBytes);
};
