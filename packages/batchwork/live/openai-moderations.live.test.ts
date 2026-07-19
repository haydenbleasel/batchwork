import { describe, it } from "bun:test";

import { LIVE_TEST_TIMEOUT_MS, runLiveModerations } from "./runner";

const MODEL_ID =
  process.env.BATCHWORK_LIVE_OPENAI_MODERATION_MODEL ??
  "omni-moderation-latest";
const hasKey = Boolean(process.env.OPENAI_API_KEY);

describe.skipIf(!hasKey)("openai live moderation batch", () => {
  it(
    `round-trips moderation records through ${MODEL_ID}`,
    () => runLiveModerations("openai", `openai/${MODEL_ID}`),
    LIVE_TEST_TIMEOUT_MS
  );
});
