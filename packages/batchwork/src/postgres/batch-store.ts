import type { BatchStore, TrackedBatch } from "../server/types";
import type { BatchProvider, BatchStatus } from "../types";
import { assertSafeTable, DEFAULT_BATCH_TABLE } from "./types";
import type { PostgresStoreOptions, SqlExecutor } from "./types";

/** Options for {@link createPostgresStore}. */
export interface PostgresBatchStoreOptions extends PostgresStoreOptions {
  /** Table to store tracked batches in. Defaults to `batchwork_batches`. */
  table?: string;
}

/** The raw row shape returned by the tracked-batch table. */
interface BatchRow {
  id: string;
  provider: BatchProvider;
  webhook_url: string | null;
  webhook_secret: string | null;
  status: BatchStatus;
  created_at: string;
  delivered_at: string | null;
}

const toBatch = (row: BatchRow): TrackedBatch => ({
  createdAt: row.created_at,
  id: row.id,
  provider: row.provider,
  status: row.status,
  // Re-add optional fields only when set, so the shape matches `createMemoryStore`
  // (and `list`'s `deliveredAt !== undefined` delivery filter stays correct).
  ...(row.webhook_url === null ? {} : { webhookUrl: row.webhook_url }),
  ...(row.webhook_secret === null ? {} : { webhookSecret: row.webhook_secret }),
  ...(row.delivered_at === null ? {} : { deliveredAt: row.delivered_at }),
});

/** `CREATE TABLE`/index DDL for the tracked-batch table (run by `migratePostgres`). */
export const batchTableDdl = (table = DEFAULT_BATCH_TABLE): string => {
  const name = assertSafeTable(table);
  return `
CREATE TABLE IF NOT EXISTS ${name} (
  id text PRIMARY KEY,
  provider text NOT NULL,
  webhook_url text,
  webhook_secret text,
  status text NOT NULL,
  created_at text NOT NULL,
  delivered_at text
);
CREATE INDEX IF NOT EXISTS ${name}_undelivered_idx
  ON ${name} (created_at) WHERE delivered_at IS NULL;`;
};

/**
 * A Postgres-backed {@link BatchStore} for the poller. Run {@link migratePostgres}
 * (or {@link batchTableDdl}) once to create the table.
 *
 * @example
 * import { Pool } from "pg";
 * const store = createPostgresStore({ client: new Pool({ connectionString }) });
 */
export const createPostgresStore = (
  options: PostgresBatchStoreOptions
): BatchStore => {
  const { client }: { client: SqlExecutor } = options;
  const table = assertSafeTable(options.table ?? DEFAULT_BATCH_TABLE);

  return {
    delete: async (id) => {
      await client.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
    },
    get: async (id) => {
      const { rows } = await client.query<BatchRow>(
        `SELECT * FROM ${table} WHERE id = $1`,
        [id]
      );
      const [row] = rows;
      return row ? toBatch(row) : null;
    },
    list: async (filter) => {
      let text = `SELECT * FROM ${table}`;
      if (filter?.delivered === true) {
        text += " WHERE delivered_at IS NOT NULL";
      } else if (filter?.delivered === false) {
        text += " WHERE delivered_at IS NULL";
      }
      const { rows } = await client.query<BatchRow>(text);
      return rows.map(toBatch);
    },
    set: async (record) => {
      await client.query(
        `INSERT INTO ${table}
           (id, provider, webhook_url, webhook_secret, status, created_at, delivered_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           provider = EXCLUDED.provider,
           webhook_url = EXCLUDED.webhook_url,
           webhook_secret = EXCLUDED.webhook_secret,
           status = EXCLUDED.status,
           created_at = EXCLUDED.created_at,
           delivered_at = EXCLUDED.delivered_at`,
        [
          record.id,
          record.provider,
          record.webhookUrl ?? null,
          record.webhookSecret ?? null,
          record.status,
          record.createdAt,
          record.deliveredAt ?? null,
        ]
      );
    },
  };
};
