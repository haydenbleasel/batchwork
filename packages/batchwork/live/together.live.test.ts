import { describe, it } from "bun:test";

import { togetherai } from "@ai-sdk/togetherai";

import { LIVE_TEST_TIMEOUT_MS, runLiveBatch } from "./runner";

// Must be a serverless, batch-supported model (Qwen2.5-7B is batch-discounted).
const MODEL_ID =
  process.env.BATCHWORK_LIVE_TOGETHER_MODEL ?? "Qwen/Qwen2.5-7B-Instruct-Turbo";
const hasKey = Boolean(process.env.TOGETHER_API_KEY);

describe.skipIf(!hasKey)("together live batch", () => {
  it(
    `round-trips 20 records through ${MODEL_ID}`,
    () => runLiveBatch("together", togetherai(MODEL_ID)),
    LIVE_TEST_TIMEOUT_MS
  );
});
