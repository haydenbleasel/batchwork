import { describe, it } from "bun:test";

import { groq } from "@ai-sdk/groq";

import { LIVE_TEST_TIMEOUT_MS, runLiveBatch } from "./runner";

const MODEL_ID =
  process.env.BATCHWORK_LIVE_GROQ_MODEL ?? "llama-3.1-8b-instant";
const hasKey = Boolean(process.env.GROQ_API_KEY);

describe.skipIf(!hasKey)("groq live batch", () => {
  it(
    `round-trips 20 records through ${MODEL_ID}`,
    () => runLiveBatch("groq", groq(MODEL_ID)),
    LIVE_TEST_TIMEOUT_MS
  );
});
