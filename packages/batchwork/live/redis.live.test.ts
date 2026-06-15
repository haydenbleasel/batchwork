import { afterAll, describe, expect, it } from "bun:test";

import { Redis } from "@upstash/redis";

import { createRedisStore } from "../src/redis";
import { runBatchStoreContract } from "../test/store-contract";

// Runs the batch store contract against a real Upstash Redis. Each test gets a
// unique key prefix so it is isolated; a best-effort cleanup removes the run's
// keys afterward. Skipped unless the Upstash REST credentials are set.
const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

if (url && token) {
  const redis = new Redis({ token, url });
  const run = Date.now();
  let counter = 0;
  const nextPrefix = (): string => {
    counter += 1;
    return `batchwork-test:${run}:${counter}`;
  };

  afterAll(async () => {
    let cursor = "0";
    do {
      // oxlint-disable-next-line no-await-in-loop -- scan is inherently sequential.
      const [next, keys] = await redis.scan(cursor, {
        count: 200,
        match: `batchwork-test:${run}:*`,
      });
      if (keys.length > 0) {
        // oxlint-disable-next-line no-await-in-loop -- delete each scan page.
        await redis.del(...keys);
      }
      cursor = next;
    } while (cursor !== "0");
  });

  runBatchStoreContract("redis (live)", () =>
    createRedisStore({ prefix: nextPrefix(), redis })
  );
} else {
  describe.skip("redis live (set UPSTASH_REDIS_REST_URL/TOKEN to run)", () => {
    it("requires Upstash credentials", () => {
      expect(url ?? token).toBeUndefined();
    });
  });
}
