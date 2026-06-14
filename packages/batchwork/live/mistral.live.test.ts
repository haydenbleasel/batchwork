import { describe, it } from "bun:test";

import { mistral } from "@ai-sdk/mistral";

import { LIVE_TEST_TIMEOUT_MS, runLiveBatch } from "./runner";

const MODEL_ID =
  process.env.BATCHWORK_LIVE_MISTRAL_MODEL ?? "mistral-small-latest";
const hasKey = Boolean(process.env.MISTRAL_API_KEY);

describe.skipIf(!hasKey)("mistral live batch", () => {
  it(
    `round-trips 20 records through ${MODEL_ID}`,
    () => runLiveBatch("mistral", mistral(MODEL_ID)),
    LIVE_TEST_TIMEOUT_MS
  );
});
