import { describe, it } from "bun:test";

import { openai } from "@ai-sdk/openai";

import { LIVE_TEST_TIMEOUT_MS, runLiveImageEdits } from "./runner";

const MODEL_ID =
  process.env.BATCHWORK_LIVE_OPENAI_IMAGE_EDIT_MODEL ?? "gpt-image-1.5";
const hasKey = Boolean(process.env.OPENAI_API_KEY);

describe.skipIf(!hasKey)("openai live image-edit batch", () => {
  it(
    `round-trips image-edit records through ${MODEL_ID}`,
    () => runLiveImageEdits("openai", openai.image(MODEL_ID)),
    LIVE_TEST_TIMEOUT_MS
  );
});
