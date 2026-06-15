import { describe, expect, it } from "bun:test";

import { createRedisStore } from "../src/redis";
import { createFakeRedis } from "./redis-fake";
import { runBatchStoreContract } from "./store-contract";

runBatchStoreContract("redis (fake)", () =>
  createRedisStore({ redis: createFakeRedis() })
);

describe("createRedisStore", () => {
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
