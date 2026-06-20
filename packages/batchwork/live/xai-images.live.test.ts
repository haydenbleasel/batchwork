import { describe, it } from "bun:test";

import { xai } from "@ai-sdk/xai";

import { LIVE_TEST_TIMEOUT_MS, runLiveImages } from "./runner";

const MODEL_ID =
  process.env.BATCHWORK_LIVE_XAI_IMAGE_MODEL ?? "grok-imagine-image-quality";
const hasKey = Boolean(process.env.XAI_API_KEY);

describe.skipIf(!hasKey)("xai live image batch", () => {
  it(
    `round-trips image records through ${MODEL_ID}`,
    () => runLiveImages("xai", xai.image(MODEL_ID)),
    LIVE_TEST_TIMEOUT_MS
  );
});
