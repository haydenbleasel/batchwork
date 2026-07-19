import { describe, it } from "bun:test";

import { LIVE_TEST_TIMEOUT_MS, runLiveModerations } from "./runner";

const MODEL_ID =
  process.env.BATCHWORK_LIVE_MISTRAL_MODERATION_MODEL ??
  "mistral-moderation-latest";
const hasKey = Boolean(process.env.MISTRAL_API_KEY);

describe.skipIf(!hasKey)("mistral live moderation batch", () => {
  it(
    `round-trips moderation records through ${MODEL_ID}`,
    () => runLiveModerations("mistral", `mistral/${MODEL_ID}`),
    LIVE_TEST_TIMEOUT_MS
  );
});
