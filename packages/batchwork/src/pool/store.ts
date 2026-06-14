import type { PendingRequest, PendingRequestStore } from "./types";

/**
 * An in-memory {@link PendingRequestStore}. Suitable for development and
 * single-process use (a long-running worker, or a `createBatchPool` with no
 * external store). For serverless, implement the interface over a durable KV/DB.
 */
export const createMemoryPendingStore = (): PendingRequestStore => {
  const rows = new Map<string, PendingRequest>();

  const pendingFor = (poolKey: string): PendingRequest[] =>
    [...rows.values()]
      .filter((row) => row.poolKey === poolKey && row.claimedAt === undefined)
      .sort((a, b) => a.enqueuedAt.localeCompare(b.enqueuedAt));

  return {
    append: (record) => {
      rows.set(record.id, record);
      return Promise.resolve();
    },
    claim: (poolKey, limit) => {
      const claimed = pendingFor(poolKey).slice(0, limit);
      if (claimed.length === 0) {
        return Promise.resolve(null);
      }
      const claimId = crypto.randomUUID();
      const claimedAt = new Date().toISOString();
      // Mark synchronously, before this promise resolves, so a concurrent claim
      // can never observe these rows as unclaimed and grab them a second time.
      for (const row of claimed) {
        rows.set(row.id, { ...row, claimId, claimedAt });
      }
      return Promise.resolve({ claimId, poolKey, requests: claimed });
    },
    count: (poolKey) => Promise.resolve(pendingFor(poolKey).length),
    oldestEnqueuedAt: (poolKey) =>
      Promise.resolve(pendingFor(poolKey)[0]?.enqueuedAt ?? null),
    release: (claim) => {
      for (const row of claim.requests) {
        const existing = rows.get(row.id);
        // Only release rows this claim still holds — a TTL reaper or a later
        // claim may already have taken them over.
        if (existing && existing.claimId === claim.claimId) {
          rows.set(row.id, {
            ...existing,
            claimId: undefined,
            claimedAt: undefined,
          });
        }
      }
      return Promise.resolve();
    },
    resolve: (claim) => {
      for (const row of claim.requests) {
        rows.delete(row.id);
      }
      return Promise.resolve();
    },
  };
};
