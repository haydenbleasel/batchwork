import { batchTableDdl } from "./batch-store";
import { assertSafeTable, DEFAULT_BATCH_TABLE } from "./types";
import type { SqlExecutor } from "./types";

/** Options for {@link migratePostgres}. */
export interface MigrateOptions {
  /** Tracked-batch table name. Defaults to `batchwork_batches`. */
  batchTable?: string;
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
 * Create the table the batch store needs. Idempotent (`CREATE TABLE IF NOT
 * EXISTS`), so it's safe to run on every boot. Call once before using the store.
 *
 * @example
 * await migratePostgres(pool);
 */
export const migratePostgres = async (
  client: SqlExecutor,
  options: MigrateOptions = {}
): Promise<void> => {
  await runDdl(
    client,
    batchTableDdl(assertSafeTable(options.batchTable ?? DEFAULT_BATCH_TABLE))
  );
};
