import { describe, it } from "bun:test";

import { xai } from "@ai-sdk/xai";

import { LIVE_TEST_TIMEOUT_MS, runLiveBatch } from "./runner";

const MODEL_ID = process.env.BATCHWORK_LIVE_XAI_MODEL ?? "grok-3-mini";
const hasKey = Boolean(process.env.XAI_API_KEY);

describe.skipIf(!hasKey)("xai live batch", () => {
  it(
    `round-trips 20 records through ${MODEL_ID}`,
    () => runLiveBatch("xai", xai(MODEL_ID)),
    LIVE_TEST_TIMEOUT_MS
  );
});
