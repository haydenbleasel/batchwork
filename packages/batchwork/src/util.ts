/** Small, defensive helpers for reading loosely-typed provider JSON. */

import { isNumber, isString } from "./guards";
import type { JsonObject, JsonValue } from "./types";

/** Linear-time trailing-slash trim; a `/\/+$/` regex is polynomial (ReDoS). */
export const trimTrailingSlashes = (value: string): string => {
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") {
    end -= 1;
  }
  return value.slice(0, end);
};

/** Whether a JSON value is an object (not an array, not `null`). */
export const isJsonObject = (
  value: JsonValue | undefined
): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Parse JSON text into the JSON domain type. This is the one place where
 * `JSON.parse`'s `any` enters the codebase: its output is, by construction, a
 * JSON value.
 */
export const parseJson = (text: string): JsonValue => {
  const value: JsonValue = JSON.parse(text);
  return value;
};

export const asRecord = (value: JsonValue | undefined): JsonObject =>
  isJsonObject(value) ? value : {};

export const asString = (value: JsonValue | undefined): string | undefined =>
  isString(value) ? value : undefined;

export const asNumber = (value: JsonValue | undefined): number | undefined =>
  isNumber(value) ? value : undefined;

export const asArray = (value: JsonValue | undefined): JsonValue[] =>
  Array.isArray(value) ? value : [];

/** Read a non-empty array of numbers (e.g. an embedding vector), else undefined. */
export const asNumberArray = (
  value: JsonValue | undefined
): number[] | undefined => {
  if (!Array.isArray(value) || value.length === 0) {
    return;
  }
  const numbers = value.filter(isNumber);
  return numbers.length === value.length ? numbers : undefined;
};

/** Return a shallow copy of `obj` without `key`. */
export const omit = (obj: JsonObject, key: string): JsonObject => {
  const result: JsonObject = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k !== key) {
      result[k] = v;
    }
  }
  return result;
};

// An empty or malformed timestamp yields an `Invalid Date`, which later throws
// `RangeError` from `.toISOString()` (e.g. when serializing a webhook event).
// Normalize those to `undefined` so a bad provider value is simply omitted.
const validDate = (date: Date): Date | undefined =>
  Number.isNaN(date.getTime()) ? undefined : date;

/** Coerce a provider timestamp (ISO string or unix seconds) to a `Date`. */
export const toDate = (value: JsonValue | undefined): Date | undefined => {
  if (isString(value)) {
    return validDate(new Date(value));
  }
  if (isNumber(value)) {
    return validDate(new Date(value * 1000));
  }
};
