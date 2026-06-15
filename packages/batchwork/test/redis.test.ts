import { describe, expect, it } from "bun:test";
import { setTimeout as sleep } from "node:timers/promises";

import { createRedisPendingStore, createRedisStore } from "../src/redis";
import { createFakeRedis } from "./redis-fake";
import {
  runBatchStoreContract,
  runPendingStoreContract,
} from "./store-contract";

runBatchStoreContract("redis (fake)", () =>
  createRedisStore({ redis: createFakeRedis() })
);

runPendingStoreContract("redis (fake)", () =>
  createRedisPendingStore({ redis: createFakeRedis() })
);

describe("createRedisPendingStore claim TTL", () => {
  it("reclaims rows whose claim is older than claimTtlMs", async () => {
    const store = createRedisPendingStore({
      claimTtlMs: 0,
      redis: createFakeRedis(),
    });
    await store.append({
      enqueuedAt: "2026-01-01T00:00:01.000Z",
      id: "a",
      poolKey: "p",
      request: { customId: "a" },
    });
    const first = await store.claim("p", 1);
    expect(first?.requests[0]?.id).toBe("a");
    await sleep(10);
    const second = await store.claim("p", 1);
    expect(second?.requests[0]?.id).toBe("a");
    expect(second?.claimId).not.toBe(first?.claimId);
  });

  it("namespaces keys by prefix", async () => {
    const redis = createFakeRedis();
    const store = createRedisStore({ prefix: "app1", redis });
    await store.set({
      createdAt: "2026-01-01T00:00:00.000Z",
      id: "b1",
      provider: "openai",
      status: "in_progress",
    });
    // A store on a different prefix shares the client but sees nothing.
    const other = createRedisStore({ prefix: "app2", redis });
    expect(await other.get("b1")).toBeNull();
    expect(await store.get("b1")).not.toBeNull();
  });
});
