import { describe, it } from "bun:test";

import { xai } from "@ai-sdk/xai";

import { LIVE_TEST_TIMEOUT_MS, runLiveImageEdits } from "./runner";

const MODEL_ID =
  process.env.BATCHWORK_LIVE_XAI_IMAGE_EDIT_MODEL ??
  "grok-imagine-image-quality";
const hasKey = Boolean(process.env.XAI_API_KEY);

describe.skipIf(!hasKey)("xai live image-edit batch", () => {
  it(
    `round-trips image-edit records through ${MODEL_ID}`,
    () => runLiveImageEdits("xai", xai.image(MODEL_ID)),
    LIVE_TEST_TIMEOUT_MS
  );
});
