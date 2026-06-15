import { afterAll, describe, expect, it } from "bun:test";

import { PGlite } from "@electric-sql/pglite";

import { createPostgresStore, migratePostgres } from "../src/postgres";
import type { SqlExecutor } from "../src/postgres";
import { runBatchStoreContract } from "./store-contract";

// Every PGlite instance is a WASM Postgres held open for the run; Bun crashes
// the process on exit (exit code 99) if any are leaked, so track and close them.
const open: PGlite[] = [];
const track = (db: PGlite): PGlite => {
  open.push(db);
  return db;
};

afterAll(async () => {
  await Promise.all(open.map((db) => db.close()));
});

// PGlite is a real Postgres (WASM) running in-process, so these exercise the
// actual SQL — CTE claim, FOR UPDATE SKIP LOCKED, jsonb, ON CONFLICT — with no
// external service. A fresh database per store keeps each test isolated.
const freshDb = async (): Promise<PGlite> => {
  const db = track(new PGlite());
  await migratePostgres(db as unknown as SqlExecutor);
  return db;
};

runBatchStoreContract("postgres (pglite)", async () =>
  createPostgresStore({ client: (await freshDb()) as unknown as SqlExecutor })
);

describe("createPostgresStore", () => {
  it("rejects an unsafe table name", () => {
    const db = track(new PGlite()) as unknown as SqlExecutor;
    expect(() =>
      createPostgresStore({ client: db, table: "bad; DROP TABLE x" })
    ).toThrow();
  });
});
