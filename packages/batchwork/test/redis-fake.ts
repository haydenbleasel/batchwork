import type { Redis } from "@upstash/redis";

/**
 * A tiny in-memory stand-in for `@upstash/redis`, supporting only the commands
 * the batch-store adapter uses (string get/set/del plus a set index). The real
 * client is validated against a live Redis in `live/redis.live.test.ts`.
 */
export const createFakeRedis = (): Redis => {
  const strings = new Map<string, string>();
  const sets = new Map<string, Set<string>>();

  const set = (key: string): Set<string> => {
    const existing = sets.get(key);
    if (existing) {
      return existing;
    }
    const created = new Set<string>();
    sets.set(key, created);
    return created;
  };

  const fake = {
    del: (...keys: string[]): Promise<number> => {
      let removed = 0;
      for (const key of keys) {
        if (strings.delete(key)) {
          removed += 1;
        }
      }
      return Promise.resolve(removed);
    },
    get: (key: string): Promise<unknown> =>
      Promise.resolve(strings.get(key) ?? null),
    mget: (...keys: string[]): Promise<unknown[]> =>
      Promise.resolve(keys.map((key) => strings.get(key) ?? null)),
    sadd: (key: string, ...members: string[]): Promise<number> => {
      const s = set(key);
      for (const member of members) {
        s.add(member);
      }
      return Promise.resolve(members.length);
    },
    set: (key: string, value: string): Promise<string> => {
      strings.set(key, value);
      return Promise.resolve("OK");
    },
    smembers: (key: string): Promise<string[]> =>
      Promise.resolve([...set(key)]),
    srem: (key: string, ...members: string[]): Promise<number> => {
      const s = set(key);
      for (const member of members) {
        s.delete(member);
      }
      return Promise.resolve(members.length);
    },
  };

  return fake as unknown as Redis;
};
