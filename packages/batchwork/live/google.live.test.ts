import { describe, it } from "bun:test";

import { google } from "@ai-sdk/google";

import { LIVE_TEST_TIMEOUT_MS, runLiveBatch } from "./runner";

const MODEL_ID = process.env.BATCHWORK_LIVE_GOOGLE_MODEL ?? "gemini-2.5-flash";
const hasKey = Boolean(
  process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GEMINI_API_KEY
);

describe.skipIf(!hasKey)("google live batch", () => {
  it(
    `round-trips 20 records through ${MODEL_ID}`,
    () => runLiveBatch("google", google(MODEL_ID)),
    LIVE_TEST_TIMEOUT_MS
  );
});
