import { describe, it } from "bun:test";

import { openai } from "@ai-sdk/openai";

import { LIVE_TEST_TIMEOUT_MS, runLiveImages } from "./runner";

const MODEL_ID = process.env.BATCHWORK_LIVE_OPENAI_IMAGE_MODEL ?? "gpt-image-2";
const hasKey = Boolean(process.env.OPENAI_API_KEY);

describe.skipIf(!hasKey)("openai live image batch", () => {
  it(
    `round-trips image records through ${MODEL_ID}`,
    () => runLiveImages("openai", openai.image(MODEL_ID)),
    LIVE_TEST_TIMEOUT_MS
  );
});
