/** Small, defensive helpers for reading loosely-typed provider JSON. */

export function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Return a shallow copy of `obj` without `key`. */
export function omit(
  obj: Record<string, unknown>,
  key: string
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k !== key) {
      result[k] = v;
    }
  }
  return result;
}

/** Coerce a provider timestamp (ISO string or unix seconds) to a `Date`. */
export function toDate(value: unknown): Date | undefined {
  if (typeof value === "string") {
    return new Date(value);
  }
  if (typeof value === "number") {
    return new Date(value * 1000);
  }
  return;
}
