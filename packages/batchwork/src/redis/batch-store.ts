import type { BatchStore, TrackedBatch } from "../server/types";
import { coerce, DEFAULT_PREFIX } from "./types";
import type { RedisStoreOptions } from "./types";

/** Options for {@link createRedisStore}. */
export type RedisBatchStoreOptions = RedisStoreOptions;

/**
 * A Redis-backed {@link BatchStore} for the poller, over `@upstash/redis`. Each
 * tracked batch is a JSON value at `{prefix}:batch:{id}`, with a set index at
 * `{prefix}:batches` so `list` can enumerate them.
 *
 * @example
 * import { Redis } from "@upstash/redis";
 * const store = createRedisStore({ redis: Redis.fromEnv() });
 */
export const createRedisStore = (
  options: RedisBatchStoreOptions
): BatchStore => {
  const { redis } = options;
  const prefix = options.prefix ?? DEFAULT_PREFIX;
  const batchKey = (id: string): string => `${prefix}:batch:${id}`;
  const indexKey = `${prefix}:batches`;

  return {
    delete: async (id) => {
      await redis.del(batchKey(id));
      await redis.srem(indexKey, id);
    },
    get: async (id) => coerce<TrackedBatch>(await redis.get(batchKey(id))),
    list: async (filter) => {
      const ids = await redis.smembers(indexKey);
      if (ids.length === 0) {
        return [];
      }
      const raws = await redis.mget<unknown[]>(...ids.map(batchKey));
      const records: TrackedBatch[] = [];
      for (const raw of raws) {
        const record = coerce<TrackedBatch>(raw);
        if (record) {
          records.push(record);
        }
      }
      if (filter?.delivered === undefined) {
        return records;
      }
      const { delivered } = filter;
      return records.filter(
        (record) => (record.deliveredAt !== undefined) === delivered
      );
    },
    set: async (record) => {
      await redis.set(batchKey(record.id), JSON.stringify(record));
      await redis.sadd(indexKey, record.id);
    },
  };
};
