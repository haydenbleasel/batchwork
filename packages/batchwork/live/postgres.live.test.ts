import { afterAll, describe, expect, it } from "bun:test";

import { Pool } from "pg";

import {
  createPostgresStore,
  DEFAULT_BATCH_TABLE,
  migratePostgres,
} from "../src/postgres";
import type { SqlExecutor } from "../src/postgres";
import { runBatchStoreContract } from "../test/store-contract";

// Runs the batch store contract against a real Postgres, driven by the actual
// `pg` client — so it also proves the generic `SqlExecutor` interface against a
// real database. Skipped unless DATABASE_URL is set.
const url = process.env.DATABASE_URL;

if (url) {
  const pool = new Pool({ connectionString: url });
  const client = pool as unknown as SqlExecutor;
  let migrated = false;
  const ensure = async (): Promise<void> => {
    if (!migrated) {
      await migratePostgres(client);
      migrated = true;
    }
  };

  afterAll(() => pool.end());

  runBatchStoreContract("postgres (live)", async () => {
    await ensure();
    await client.query(`TRUNCATE TABLE ${DEFAULT_BATCH_TABLE}`);
    return createPostgresStore({ client });
  });
} else {
  describe.skip("postgres live (set DATABASE_URL to run)", () => {
    it("requires DATABASE_URL", () => {
      expect(url).toBeUndefined();
    });
  });
}
