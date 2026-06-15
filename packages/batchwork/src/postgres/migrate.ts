import { batchTableDdl } from "./batch-store";
import { pendingTableDdl } from "./pending-store";
import {
  assertSafeTable,
  DEFAULT_BATCH_TABLE,
  DEFAULT_PENDING_TABLE,
} from "./types";
import type { SqlExecutor } from "./types";

/** Options for {@link migratePostgres}. */
export interface MigrateOptions {
  /** Tracked-batch table name. Defaults to `batchwork_batches`. */
  batchTable?: string;
  /** Pending-request table name. Defaults to `batchwork_pending`. */
  pendingTable?: string;
  /** Skip the tracked-batch table (e.g. you only use the pool). */
  batches?: boolean;
  /** Skip the pending table (e.g. you only use the poller). */
  pending?: boolean;
}

// Run a multi-statement DDL string one statement at a time: some drivers
// (notably PGlite's extended protocol) reject multiple statements per query.
const runDdl = async (client: SqlExecutor, ddl: string): Promise<void> => {
  for (const statement of ddl.split(";")) {
    const trimmed = statement.trim();
    if (trimmed) {
      // oxlint-disable-next-line no-await-in-loop -- DDL must run in order.
      await client.query(trimmed);
    }
  }
};

/**
 * Create the tables both Postgres stores need. Idempotent (`CREATE TABLE IF NOT
 * EXISTS`), so it's safe to run on every boot. Call once before using the stores.
 *
 * @example
 * await migratePostgres(pool);
 */
export const migratePostgres = async (
  client: SqlExecutor,
  options: MigrateOptions = {}
): Promise<void> => {
  if (options.batches !== false) {
    await runDdl(
      client,
      batchTableDdl(assertSafeTable(options.batchTable ?? DEFAULT_BATCH_TABLE))
    );
  }
  if (options.pending !== false) {
    await runDdl(
      client,
      pendingTableDdl(
        assertSafeTable(options.pendingTable ?? DEFAULT_PENDING_TABLE)
      )
    );
  }
};
