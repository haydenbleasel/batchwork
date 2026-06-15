/**
 * The minimal slice of a Postgres client batchwork's adapters use: a
 * node-postgres-style `query(text, params)` returning `{ rows }`. This is
 * deliberately structural so you can pass a `pg.Pool`/`pg.Client`, a
 * `@neondatabase/serverless` client, or any thin wrapper that exposes `query` —
 * batchwork never imports a driver, so it adds no dependency of its own.
 */
export interface SqlExecutor {
  query: <Row = Record<string, unknown>>(
    text: string,
    params?: unknown[]
  ) => Promise<{ rows: Row[] }>;
}

/** Shared options for both Postgres-backed stores. */
export interface PostgresStoreOptions {
  /** A `pg.Pool`-compatible client (anything with `query(text, params)`). */
  client: SqlExecutor;
}

/** Table names default to these; override per store for custom schemas. */
export const DEFAULT_BATCH_TABLE = "batchwork_batches";
export const DEFAULT_PENDING_TABLE = "batchwork_pending";

/**
 * Guard against SQL injection through a caller-supplied table name: identifiers
 * can't be parameterized, so they're interpolated directly and must be a plain
 * unquoted identifier (optionally schema-qualified).
 */
export const assertSafeTable = (table: string): string => {
  if (
    !/^[A-Za-z_][A-Za-z0-9_]*(?<schema>\.[A-Za-z_][A-Za-z0-9_]*)?$/u.test(table)
  ) {
    throw new Error(
      `batchwork: unsafe Postgres table name ${JSON.stringify(table)}.`
    );
  }
  return table;
};
