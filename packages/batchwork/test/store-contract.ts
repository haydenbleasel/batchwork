import { beforeEach, describe, expect, it } from "bun:test";

import type { PendingRequestStore } from "../src/pool/types";
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

/**
 * A backend-agnostic test suite for the {@link PendingRequestStore} contract.
 * `makeStore` must return a fresh, empty store each call.
 */
export const runPendingStoreContract = (
  label: string,
  makeStore: () => Promise<PendingRequestStore> | PendingRequestStore
): void => {
  describe(`PendingRequestStore contract: ${label}`, () => {
    let store: PendingRequestStore;

    beforeEach(async () => {
      store = await makeStore();
    });

    const append = (id: string, second: number, poolKey = "p"): Promise<void> =>
      store.append({
        enqueuedAt: `2026-01-01T00:00:0${second}.000Z`,
        id,
        poolKey,
        request: { customId: id, prompt: `prompt-${id}` },
      });

    it("tracks count and oldest enqueued time", async () => {
      expect(await store.count("p")).toBe(0);
      expect(await store.oldestEnqueuedAt("p")).toBeNull();
      await append("a", 1);
      await append("b", 2);
      expect(await store.count("p")).toBe(2);
      expect(await store.oldestEnqueuedAt("p")).toBe(
        "2026-01-01T00:00:01.000Z"
      );
    });

    it("returns null when nothing is claimable", async () => {
      expect(await store.claim("p", 5)).toBeNull();
    });

    it("claims the oldest rows up to the limit and marks them claimed", async () => {
      await append("a", 1);
      await append("b", 2);
      await append("c", 3);
      const claim = await store.claim("p", 2);
      expect(claim?.requests.map((r) => r.id).toSorted()).toEqual(["a", "b"]);
      // The claimed rows preserve their payload...
      expect(claim?.requests.find((r) => r.id === "a")?.request.prompt).toBe(
        "prompt-a"
      );
      // ...and no longer count as pending.
      expect(await store.count("p")).toBe(1);
      expect(await store.oldestEnqueuedAt("p")).toBe(
        "2026-01-01T00:00:03.000Z"
      );
    });

    it("hands out disjoint rows to concurrent claims", async () => {
      for (let i = 0; i < 6; i += 1) {
        // oxlint-disable-next-line no-await-in-loop -- sequential seeding is fine.
        await append(`r${i}`, i);
      }
      const [first, second] = await Promise.all([
        store.claim("p", 3),
        store.claim("p", 3),
      ]);
      const ids = [...(first?.requests ?? []), ...(second?.requests ?? [])].map(
        (r) => r.id
      );
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("permanently removes a claim's rows on resolve", async () => {
      await append("a", 1);
      await append("b", 2);
      const claim = await store.claim("p", 2);
      if (claim) {
        await store.resolve(claim);
      }
      expect(await store.count("p")).toBe(0);
      expect(await store.claim("p", 5)).toBeNull();
    });

    it("returns a claim's rows to pending on release", async () => {
      await append("a", 1);
      await append("b", 2);
      const claim = await store.claim("p", 2);
      expect(await store.count("p")).toBe(0);
      if (claim) {
        await store.release(claim);
      }
      expect(await store.count("p")).toBe(2);
      const reclaim = await store.claim("p", 1);
      expect(reclaim?.requests.map((r) => r.id)).toEqual(["a"]);
    });

    it("isolates rows by poolKey", async () => {
      await append("a", 1, "p1");
      await append("b", 2, "p2");
      expect(await store.count("p1")).toBe(1);
      expect(await store.count("p2")).toBe(1);
      const claim = await store.claim("p1", 5);
      expect(claim?.requests.map((r) => r.id)).toEqual(["a"]);
      expect(await store.count("p2")).toBe(1);
    });
  });
};
