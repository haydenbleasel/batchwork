import { beforeEach, describe, expect, it } from "bun:test";

import type { BatchStore, TrackedBatch } from "../src/server/types";

const sample = (overrides?: Partial<TrackedBatch>): TrackedBatch => ({
  createdAt: "2026-01-01T00:00:00.000Z",
  id: "b1",
  provider: "openai",
  status: "in_progress",
  ...overrides,
});

/**
 * A backend-agnostic test suite for the {@link BatchStore} contract. Run it
 * against every implementation (memory, Postgres, Redis) so they all behave
 * identically. `makeStore` must return a fresh, empty store each call.
 */
export const runBatchStoreContract = (
  label: string,
  makeStore: () => Promise<BatchStore> | BatchStore
): void => {
  describe(`BatchStore contract: ${label}`, () => {
    let store: BatchStore;

    beforeEach(async () => {
      store = await makeStore();
    });

    it("returns null for a missing record", async () => {
      expect(await store.get("nope")).toBeNull();
    });

    it("round-trips a fully-populated record", async () => {
      const record = sample({
        id: "full",
        webhookSecret: "shh",
        webhookUrl: "https://example.com/hook",
      });
      await store.set(record);
      expect(await store.get("full")).toEqual(record);
    });

    it("round-trips a callback-style record with no webhook fields", async () => {
      const record = sample({ id: "cb" });
      await store.set(record);
      expect(await store.get("cb")).toEqual(record);
    });

    it("upserts on repeated set", async () => {
      await store.set(sample({ id: "up", status: "in_progress" }));
      await store.set(sample({ id: "up", status: "completed" }));
      const updated = await store.get("up");
      expect(updated?.status).toBe("completed");
    });

    it("lists and filters by delivered", async () => {
      await store.set(sample({ id: "open" }));
      await store.set(
        sample({ deliveredAt: "2026-01-02T00:00:00.000Z", id: "done" })
      );
      const all = await store.list();
      expect(all.length).toBe(2);
      const undelivered = await store.list({ delivered: false });
      expect(undelivered.map((r) => r.id)).toEqual(["open"]);
      const delivered = await store.list({ delivered: true });
      expect(delivered.map((r) => r.id)).toEqual(["done"]);
    });

    it("deletes a record", async () => {
      await store.set(sample({ id: "del" }));
      await store.delete("del");
      expect(await store.get("del")).toBeNull();
    });
  });
};
