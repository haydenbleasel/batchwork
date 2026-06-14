import { describe, it } from "bun:test";

import { anthropic } from "@ai-sdk/anthropic";

import { LIVE_TEST_TIMEOUT_MS, runLiveBatch } from "./runner";

const MODEL_ID =
  process.env.BATCHWORK_LIVE_ANTHROPIC_MODEL ?? "claude-haiku-4-5";
const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);

describe.skipIf(!hasKey)("anthropic live batch", () => {
  it(
    `round-trips 20 records through ${MODEL_ID}`,
    () => runLiveBatch("anthropic", anthropic(MODEL_ID)),
    LIVE_TEST_TIMEOUT_MS
  );
});
