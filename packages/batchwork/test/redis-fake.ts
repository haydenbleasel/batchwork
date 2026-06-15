import type { Redis } from "@upstash/redis";

import {
  CLAIM_SCRIPT,
  RELEASE_SCRIPT,
  RESOLVE_SCRIPT,
} from "../src/redis/scripts";

/**
 * A tiny in-memory stand-in for `@upstash/redis`, supporting only the commands
 * batchwork's adapters use. `eval` dispatches the three pending-store Lua scripts
 * to faithful JS ports so the adapter's orchestration is exercised in CI; the
 * real Lua is validated against a live Redis in `live/redis.live.test.ts`.
 *
 * Single-threaded JS gives `eval` the same run-to-completion atomicity Redis
 * gives Lua, so the concurrency contract holds here too.
 */
export const createFakeRedis = (): Redis => {
  const strings = new Map<string, string>();
  const sets = new Map<string, Set<string>>();
  const zsets = new Map<string, Map<string, number>>();
  const hashes = new Map<string, Map<string, string>>();

  const set = (key: string): Set<string> => {
    const existing = sets.get(key);
    if (existing) {
      return existing;
    }
    const created = new Set<string>();
    sets.set(key, created);
    return created;
  };
  const zset = (key: string): Map<string, number> => {
    const existing = zsets.get(key);
    if (existing) {
      return existing;
    }
    const created = new Map<string, number>();
    zsets.set(key, created);
    return created;
  };
  const hash = (key: string): Map<string, string> => {
    const existing = hashes.get(key);
    if (existing) {
      return existing;
    }
    const created = new Map<string, string>();
    hashes.set(key, created);
    return created;
  };

  const evalClaim = (keys: string[], args: string[]): string[] => {
    const [pendingK, claimedK, enqK] = keys as [string, string, string];
    const [limitS, claimedMs, cutoffS, rowClaimPrefix, claimId] = args as [
      string,
      string,
      string,
      string,
      string,
    ];
    const limit = Number(limitS);
    const cutoff = Number(cutoffS);
    const pending = zset(pendingK);
    const claimed = zset(claimedK);
    const enq = hash(enqK);
    for (const [id, score] of claimed) {
      if (score < cutoff) {
        const enqScore = enq.get(id);
        if (enqScore !== undefined) {
          pending.set(id, Number(enqScore));
        }
        claimed.delete(id);
        strings.delete(`${rowClaimPrefix}${id}`);
      }
    }
    const oldest = [...pending.entries()]
      .toSorted((a, b) => a[1] - b[1])
      .slice(0, limit);
    const ids: string[] = [];
    for (const [id] of oldest) {
      pending.delete(id);
      ids.push(id);
      claimed.set(id, Number(claimedMs));
      strings.set(`${rowClaimPrefix}${id}`, claimId);
    }
    return ids;
  };

  const evalResolve = (keys: string[], args: string[]): number => {
    const [claimedK, enqK] = keys as [string, string];
    const [claimId, rowPrefix, rowClaimPrefix, ...ids] = args;
    const claimed = zset(claimedK);
    const enq = hash(enqK);
    for (const id of ids) {
      if (strings.get(`${rowClaimPrefix}${id}`) === claimId) {
        claimed.delete(id);
        strings.delete(`${rowPrefix}${id}`);
        strings.delete(`${rowClaimPrefix}${id}`);
        enq.delete(id);
      }
    }
    return 1;
  };

  const evalRelease = (keys: string[], args: string[]): number => {
    const [pendingK, claimedK] = keys as [string, string];
    const [claimId, rowClaimPrefix, ...rest] = args;
    const pending = zset(pendingK);
    const claimed = zset(claimedK);
    for (let i = 0; i < rest.length; i += 2) {
      const id = rest[i] as string;
      const enq = rest[i + 1] as string;
      if (strings.get(`${rowClaimPrefix}${id}`) === claimId) {
        pending.set(id, Number(enq));
        claimed.delete(id);
        strings.delete(`${rowClaimPrefix}${id}`);
      }
    }
    return 1;
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
    eval: (
      script: string,
      keys: string[],
      args: string[]
    ): Promise<unknown> => {
      if (script === CLAIM_SCRIPT) {
        return Promise.resolve(evalClaim(keys, args));
      }
      if (script === RESOLVE_SCRIPT) {
        return Promise.resolve(evalResolve(keys, args));
      }
      if (script === RELEASE_SCRIPT) {
        return Promise.resolve(evalRelease(keys, args));
      }
      throw new Error("fake-redis: unknown script");
    },
    get: (key: string): Promise<unknown> =>
      Promise.resolve(strings.get(key) ?? null),
    hset: (key: string, kv: Record<string, unknown>): Promise<number> => {
      const h = hash(key);
      for (const [field, value] of Object.entries(kv)) {
        h.set(field, String(value));
      }
      return Promise.resolve(Object.keys(kv).length);
    },
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
    zadd: (
      key: string,
      scoreMember: { score: number; member: string }
    ): Promise<number> => {
      zset(key).set(scoreMember.member, scoreMember.score);
      return Promise.resolve(1);
    },
    zcard: (key: string): Promise<number> => Promise.resolve(zset(key).size),
    zrange: (
      key: string,
      min: number,
      max: number,
      opts?: { withScores?: boolean }
    ): Promise<(string | number)[]> => {
      const sorted = [...zset(key).entries()].toSorted((a, b) => a[1] - b[1]);
      const slice = sorted.slice(min, max + 1);
      if (opts?.withScores) {
        return Promise.resolve(
          slice.flatMap(([member, score]) => [member, score])
        );
      }
      return Promise.resolve(slice.map(([member]) => member));
    },
  };

  return fake as unknown as Redis;
};
