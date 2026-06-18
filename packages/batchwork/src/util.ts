/** Small, defensive helpers for reading loosely-typed provider JSON. */

export const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value === "object" && value !== null) {
    return value as Record<string, unknown>;
  }
  return {};
};

export const asString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

export const asNumber = (value: unknown): number | undefined =>
  typeof value === "number" ? value : undefined;

export const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

/** Read a non-empty array of numbers (e.g. an embedding vector), else undefined. */
export const asNumberArray = (value: unknown): number[] | undefined => {
  if (!Array.isArray(value) || value.length === 0) {
    return;
  }
  const numbers = value.filter(
    (item): item is number => typeof item === "number"
  );
  return numbers.length === value.length ? numbers : undefined;
};

/** Return a shallow copy of `obj` without `key`. */
export const omit = (
  obj: Record<string, unknown>,
  key: string
): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k !== key) {
      result[k] = v;
    }
  }
  return result;
};

/** Coerce a provider timestamp (ISO string or unix seconds) to a `Date`. */
export const toDate = (value: unknown): Date | undefined => {
  if (typeof value === "string") {
    return new Date(value);
  }
  if (typeof value === "number") {
    return new Date(value * 1000);
  }
};
