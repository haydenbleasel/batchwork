import { isString } from "../guards";
import type { TrackedBatch } from "../server/types";
import type {
  BatchProvider,
  BatchStatus,
  JsonObject,
  JsonValue,
} from "../types";
import { asString, isJsonObject, parseJson } from "../util";

/**
 * The slice of `@upstash/redis` batchwork's adapters drive: string get/set/del
 * plus a set index. Structural, so a real `Redis` instance (or any compatible
 * client) can be passed without batchwork importing the driver.
 */
export interface RedisClient {
  del: (...keys: string[]) => Promise<number>;
  get: (key: string) => Promise<JsonValue | null>;
  mget: (...keys: string[]) => Promise<(JsonValue | null)[]>;
  sadd: (key: string, member: string, ...members: string[]) => Promise<number>;
  set: (key: string, value: string) => Promise<string | null>;
  smembers: (key: string) => Promise<string[]>;
  srem: (key: string, member: string, ...members: string[]) => Promise<number>;
}

/** Options for the Redis-backed batch store. */
export interface RedisStoreOptions {
  /** A connected `@upstash/redis` client. */
  redis: RedisClient;
  /** Key namespace, so one Redis can back many apps. Defaults to `batchwork`. */
  prefix?: string;
}

export const DEFAULT_PREFIX = "batchwork";

/** Read a stored JSON object back into a tracked batch; `null` if malformed. */
const toTrackedBatch = (record: JsonObject): TrackedBatch | null => {
  const id = asString(record.id);
  const provider = asString(record.provider);
  const status = asString(record.status);
  const createdAt = asString(record.createdAt);
  if (!(id && provider && status && createdAt)) {
    return null;
  }
  // SAFETY: keys under the store's prefix are only ever written by `set` as
  // `JSON.stringify` of a TrackedBatch, so these strings are the union members
  // that record carried.
  const batch: TrackedBatch = {
    createdAt,
    id,
    provider: provider as BatchProvider,
    status: status as BatchStatus,
  };
  const webhookUrl = asString(record.webhookUrl);
  if (webhookUrl !== undefined) {
    batch.webhookUrl = webhookUrl;
  }
  const webhookSecret = asString(record.webhookSecret);
  if (webhookSecret !== undefined) {
    batch.webhookSecret = webhookSecret;
  }
  const deliveredAt = asString(record.deliveredAt);
  if (deliveredAt !== undefined) {
    batch.deliveredAt = deliveredAt;
  }
  return batch;
};

/**
 * Read a stored value back into a record. `@upstash/redis` may or may not
 * auto-deserialize depending on the client's config, and values returned from
 * Lua (`eval`) are always raw strings — so tolerate both an object and a JSON
 * string, and treat a missing key as `null`.
 */
export const coerce = (value: JsonValue | null): TrackedBatch | null => {
  if (value === null) {
    return null;
  }
  const record = isString(value) ? parseJson(value) : value;
  return isJsonObject(record) ? toTrackedBatch(record) : null;
};
