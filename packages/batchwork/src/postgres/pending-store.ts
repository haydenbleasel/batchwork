import type {
  PendingClaim,
  PendingRequest,
  PendingRequestStore,
} from "../pool/types";
import type { BatchRequest } from "../types";
import { assertSafeTable, DEFAULT_PENDING_TABLE } from "./types";
import type { PostgresStoreOptions, SqlExecutor } from "./types";

/** Default TTL after which a claimed-but-unresolved row is reclaimable (10 min). */
const DEFAULT_CLAIM_TTL_MS = 10 * 60 * 1000;

/** Options for {@link createPostgresPendingStore}. */
export interface PostgresPendingStoreOptions extends PostgresStoreOptions {
  /** Table to buffer pending requests in. Defaults to `batchwork_pending`. */
  table?: string;
  /**
   * How long, in ms, a claimed row may stay unresolved before a later `claim`
   * may reclaim it — the crash-recovery TTL. Set this comfortably above your
   * worst-case flush time (provider upload + submit); the docs suggest
   * `≈ 2 × maxDuration`. Defaults to 10 minutes.
   */
  claimTtlMs?: number;
}

/** The raw row shape returned by the pending table. */
interface PendingRow {
  id: string;
  pool_key: string;
  request: BatchRequest | string;
  enqueued_at: string;
  claimed_at: string | null;
  claim_id: string | null;
}

const toPending = (row: PendingRow): PendingRequest => ({
  enqueuedAt: row.enqueued_at,
  id: row.id,
  poolKey: row.pool_key,
  // Most drivers (pg, PGlite) parse jsonb to an object; tolerate text too.
  request:
    typeof row.request === "string"
      ? (JSON.parse(row.request) as BatchRequest)
      : row.request,
  ...(row.claimed_at === null ? {} : { claimedAt: row.claimed_at }),
  ...(row.claim_id === null ? {} : { claimId: row.claim_id }),
});

/** `CREATE TABLE`/index DDL for the pending table (run by `migratePostgres`). */
export const pendingTableDdl = (table = DEFAULT_PENDING_TABLE): string => {
  const name = assertSafeTable(table);
  return `
CREATE TABLE IF NOT EXISTS ${name} (
  id text PRIMARY KEY,
  pool_key text NOT NULL,
  request jsonb NOT NULL,
  enqueued_at text NOT NULL,
  claimed_at text,
  claim_id text
);
CREATE INDEX IF NOT EXISTS ${name}_claimable_idx
  ON ${name} (pool_key, claimed_at, enqueued_at);`;
};

/**
 * A Postgres-backed {@link PendingRequestStore} for `createBatchPool`. The
 * atomicity contract lives in `claim`, implemented with `SELECT … FOR UPDATE
 * SKIP LOCKED` inside a CTE so two concurrent flushes can never claim the same
 * row. Expired claims (older than {@link PostgresPendingStoreOptions.claimTtlMs})
 * are reclaimable, recovering rows stranded by a crash between claim and resolve.
 *
 * Run {@link migratePostgres} (or {@link pendingTableDdl}) once to create the table.
 */
export const createPostgresPendingStore = (
  options: PostgresPendingStoreOptions
): PendingRequestStore => {
  const { client }: { client: SqlExecutor } = options;
  const table = assertSafeTable(options.table ?? DEFAULT_PENDING_TABLE);
  const claimTtlMs = options.claimTtlMs ?? DEFAULT_CLAIM_TTL_MS;

  return {
    append: async (record) => {
      await client.query(
        `INSERT INTO ${table}
           (id, pool_key, request, enqueued_at, claimed_at, claim_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          record.id,
          record.poolKey,
          JSON.stringify(record.request),
          record.enqueuedAt,
          record.claimedAt ?? null,
          record.claimId ?? null,
        ]
      );
    },
    claim: async (poolKey, limit) => {
      const claimId = crypto.randomUUID();
      const claimedAt = new Date().toISOString();
      const cutoff = new Date(Date.now() - claimTtlMs).toISOString();
      // Single statement → one implicit transaction → atomic. SKIP LOCKED lets
      // concurrent claims race over disjoint rows instead of blocking.
      const { rows } = await client.query<PendingRow>(
        `WITH claimable AS (
           SELECT id FROM ${table}
           WHERE pool_key = $1 AND (claimed_at IS NULL OR claimed_at < $2)
           ORDER BY enqueued_at ASC
           LIMIT $3
           FOR UPDATE SKIP LOCKED
         )
         UPDATE ${table} t
         SET claim_id = $4, claimed_at = $5
         FROM claimable c
         WHERE t.id = c.id
         RETURNING t.id, t.pool_key, t.request, t.enqueued_at, t.claimed_at, t.claim_id`,
        [poolKey, cutoff, limit, claimId, claimedAt]
      );
      if (rows.length === 0) {
        return null;
      }
      return { claimId, poolKey, requests: rows.map(toPending) };
    },
    count: async (poolKey) => {
      const { rows } = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM ${table}
         WHERE pool_key = $1 AND claimed_at IS NULL`,
        [poolKey]
      );
      return rows[0]?.n ?? 0;
    },
    oldestEnqueuedAt: async (poolKey) => {
      const { rows } = await client.query<{ enqueued_at: string }>(
        `SELECT enqueued_at FROM ${table}
         WHERE pool_key = $1 AND claimed_at IS NULL
         ORDER BY enqueued_at ASC LIMIT 1`,
        [poolKey]
      );
      return rows[0]?.enqueued_at ?? null;
    },
    release: async (claim) => {
      // Only release rows this claim still holds — a TTL reaper or later claim
      // may already have taken them over.
      await client.query(
        `UPDATE ${table} SET claim_id = NULL, claimed_at = NULL
         WHERE id = ANY($1) AND claim_id = $2`,
        [claim.requests.map((row) => row.id), claim.claimId]
      );
    },
    resolve: async (claim: PendingClaim) => {
      await client.query(
        `DELETE FROM ${table} WHERE id = ANY($1) AND claim_id = $2`,
        [claim.requests.map((row) => row.id), claim.claimId]
      );
    },
  };
};
