import { describe, it } from "bun:test";

import { google } from "@ai-sdk/google";

import { LIVE_TEST_TIMEOUT_MS, runLiveImages } from "./runner";

const MODEL_ID =
  process.env.BATCHWORK_LIVE_GOOGLE_IMAGE_MODEL ?? "gemini-2.5-flash-image";
const hasKey = Boolean(
  process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GEMINI_API_KEY
);

describe.skipIf(!hasKey)("google live image batch", () => {
  it(
    `round-trips image records through ${MODEL_ID}`,
    () => runLiveImages("google", google.image(MODEL_ID)),
    LIVE_TEST_TIMEOUT_MS
  );
});
