import type {
  PendingClaim,
  PendingRequest,
  PendingRequestStore,
} from "../pool/types";
import type { BatchRequest } from "../types";
import { CLAIM_SCRIPT, RELEASE_SCRIPT, RESOLVE_SCRIPT } from "./scripts";
import { coerce, DEFAULT_PREFIX } from "./types";
import type { RedisStoreOptions } from "./types";

/** Default TTL after which a claimed-but-unresolved row is reclaimable (10 min). */
const DEFAULT_CLAIM_TTL_MS = 10 * 60 * 1000;

/** Options for {@link createRedisPendingStore}. */
export interface RedisPendingStoreOptions extends RedisStoreOptions {
  /**
   * How long, in ms, a claimed row may stay unresolved before a later `claim`
   * may reclaim it — the crash-recovery TTL. Set this comfortably above your
   * worst-case flush time; the docs suggest `≈ 2 × maxDuration`. Defaults to
   * 10 minutes.
   */
  claimTtlMs?: number;
}

/** The immutable core of a pending row, stored as JSON at `{prefix}:row:{id}`. */
interface PendingCore {
  id: string;
  poolKey: string;
  request: BatchRequest;
  enqueuedAt: string;
}

/**
 * A Redis-backed {@link PendingRequestStore} for `createBatchPool`, over
 * `@upstash/redis`. The atomicity contract in `claim` is enforced by a Lua
 * script (`ZPOPMIN` into a claimed set) so two concurrent flushes can never
 * claim the same row. Claims older than
 * {@link RedisPendingStoreOptions.claimTtlMs} are reclaimed by the next `claim`,
 * recovering rows stranded by a crash between claim and resolve.
 *
 * Layout per pool: a `pending` sorted set (score = enqueued ms) holds unclaimed
 * rows, a `claimed` sorted set (score = claimed ms) holds in-flight rows, and an
 * `enq` hash maps row id → enqueued ms for reordering on reclaim.
 */
export const createRedisPendingStore = (
  options: RedisPendingStoreOptions
): PendingRequestStore => {
  const { redis } = options;
  const prefix = options.prefix ?? DEFAULT_PREFIX;
  const claimTtlMs = options.claimTtlMs ?? DEFAULT_CLAIM_TTL_MS;

  const pendingKey = (poolKey: string): string =>
    `${prefix}:pending:${poolKey}`;
  const claimedKey = (poolKey: string): string =>
    `${prefix}:claimed:${poolKey}`;
  const enqKey = (poolKey: string): string => `${prefix}:enq:${poolKey}`;
  const rowPrefix = `${prefix}:row:`;
  const rowClaimPrefix = `${prefix}:rowclaim:`;
  const rowKey = (id: string): string => `${rowPrefix}${id}`;

  return {
    append: async (record) => {
      const enqueuedMs = new Date(record.enqueuedAt).getTime();
      const core: PendingCore = {
        enqueuedAt: record.enqueuedAt,
        id: record.id,
        poolKey: record.poolKey,
        request: record.request,
      };
      await redis.set(rowKey(record.id), JSON.stringify(core));
      await redis.hset(enqKey(record.poolKey), { [record.id]: enqueuedMs });
      await redis.zadd(pendingKey(record.poolKey), {
        member: record.id,
        score: enqueuedMs,
      });
    },
    claim: async (poolKey, limit) => {
      const claimId = crypto.randomUUID();
      const claimedMs = Date.now();
      const cutoffMs = claimedMs - claimTtlMs;
      const ids = (await redis.eval(
        CLAIM_SCRIPT,
        [pendingKey(poolKey), claimedKey(poolKey), enqKey(poolKey)],
        [
          String(limit),
          String(claimedMs),
          String(cutoffMs),
          rowClaimPrefix,
          claimId,
        ]
      )) as string[];
      if (!ids || ids.length === 0) {
        return null;
      }
      const raws = await redis.mget<unknown[]>(...ids.map(rowKey));
      const claimedAt = new Date(claimedMs).toISOString();
      const requests: PendingRequest[] = [];
      for (const raw of raws) {
        const core = coerce<PendingCore>(raw);
        if (core) {
          requests.push({ ...core, claimId, claimedAt });
        }
      }
      if (requests.length === 0) {
        return null;
      }
      return { claimId, poolKey, requests };
    },
    count: (poolKey) => redis.zcard(pendingKey(poolKey)),
    oldestEnqueuedAt: async (poolKey) => {
      const res = await redis.zrange<(string | number)[]>(
        pendingKey(poolKey),
        0,
        0,
        { withScores: true }
      );
      const [, score] = res;
      return score === undefined ? null : new Date(Number(score)).toISOString();
    },
    release: async (claim) => {
      const args: string[] = [claim.claimId, rowClaimPrefix];
      for (const row of claim.requests) {
        args.push(row.id, String(new Date(row.enqueuedAt).getTime()));
      }
      await redis.eval(
        RELEASE_SCRIPT,
        [pendingKey(claim.poolKey), claimedKey(claim.poolKey)],
        args
      );
    },
    resolve: async (claim: PendingClaim) => {
      await redis.eval(
        RESOLVE_SCRIPT,
        [claimedKey(claim.poolKey), enqKey(claim.poolKey)],
        [
          claim.claimId,
          rowPrefix,
          rowClaimPrefix,
          ...claim.requests.map((row) => row.id),
        ]
      );
    },
  };
};
