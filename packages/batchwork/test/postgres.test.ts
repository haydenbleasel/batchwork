import { afterAll, describe, expect, it } from "bun:test";
import { setTimeout as sleep } from "node:timers/promises";

import { PGlite } from "@electric-sql/pglite";

import {
  createPostgresPendingStore,
  createPostgresStore,
  migratePostgres,
} from "../src/postgres";
import type { SqlExecutor } from "../src/postgres";
import {
  runBatchStoreContract,
  runPendingStoreContract,
} from "./store-contract";

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

runPendingStoreContract("postgres (pglite)", async () =>
  createPostgresPendingStore({
    client: (await freshDb()) as unknown as SqlExecutor,
  })
);

describe("createPostgresPendingStore claim TTL", () => {
  it("reclaims rows whose claim is older than claimTtlMs", async () => {
    const db = (await freshDb()) as unknown as SqlExecutor;
    const store = createPostgresPendingStore({ claimTtlMs: 0, client: db });
    await store.append({
      enqueuedAt: "2026-01-01T00:00:01.000Z",
      id: "a",
      poolKey: "p",
      request: { customId: "a" },
    });
    // First claim takes the row; with a 0ms TTL, any elapsed time makes it
    // reclaimable, so the next claim (after a tick) takes it over.
    const first = await store.claim("p", 1);
    expect(first?.requests[0]?.id).toBe("a");
    await sleep(10);
    const second = await store.claim("p", 1);
    expect(second?.requests[0]?.id).toBe("a");
    expect(second?.claimId).not.toBe(first?.claimId);
  });

  it("rejects an unsafe table name", () => {
    const db = track(new PGlite()) as unknown as SqlExecutor;
    expect(() =>
      createPostgresStore({ client: db, table: "bad; DROP TABLE x" })
    ).toThrow();
  });
});
