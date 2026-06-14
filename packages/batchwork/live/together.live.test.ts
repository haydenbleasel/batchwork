import { describe, it } from "bun:test";

import { togetherai } from "@ai-sdk/togetherai";

import { LIVE_TEST_TIMEOUT_MS, runLiveBatch } from "./runner";

const MODEL_ID =
  process.env.BATCHWORK_LIVE_TOGETHER_MODEL ??
  "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo";
const hasKey = Boolean(process.env.TOGETHER_API_KEY);

describe.skipIf(!hasKey)("together live batch", () => {
  it(
    `round-trips 20 records through ${MODEL_ID}`,
    () => runLiveBatch("together", togetherai(MODEL_ID)),
    LIVE_TEST_TIMEOUT_MS
  );
});
