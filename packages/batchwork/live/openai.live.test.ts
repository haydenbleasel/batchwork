import { describe, it } from "bun:test";

import { openai } from "@ai-sdk/openai";

import { LIVE_TEST_TIMEOUT_MS, runLiveBatch } from "./runner";

const MODEL_ID = process.env.BATCHWORK_LIVE_OPENAI_MODEL ?? "gpt-4o-mini";
const hasKey = Boolean(process.env.OPENAI_API_KEY);

describe.skipIf(!hasKey)("openai live batch", () => {
  it(
    `round-trips 20 records through ${MODEL_ID}`,
    () => runLiveBatch("openai", openai.chat(MODEL_ID)),
    LIVE_TEST_TIMEOUT_MS
  );
});
