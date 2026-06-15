import type { Redis } from "@upstash/redis";

/** The Upstash Redis client batchwork's adapters drive. */
export type RedisClient = Redis;

/** Shared options for both Redis-backed stores. */
export interface RedisStoreOptions {
  /** A connected `@upstash/redis` client. */
  redis: Redis;
  /** Key namespace, so one Redis can back many apps. Defaults to `batchwork`. */
  prefix?: string;
}

export const DEFAULT_PREFIX = "batchwork";

/**
 * Read a stored value back into a record. `@upstash/redis` may or may not
 * auto-deserialize depending on the client's config, and values returned from
 * Lua (`eval`) are always raw strings — so tolerate both an object and a JSON
 * string, and treat a missing key as `null`.
 */
export const coerce = <T>(value: unknown): T | null => {
  if (value === null || value === undefined) {
    return null;
  }
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
};
