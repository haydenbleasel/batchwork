import { describe, it } from "bun:test";

import { LIVE_TEST_TIMEOUT_MS, runLiveTranslations } from "./runner";

const MODEL_ID =
  process.env.BATCHWORK_LIVE_TOGETHER_TRANSLATION_MODEL ??
  "openai/whisper-large-v3";
const hasKey = Boolean(process.env.TOGETHER_API_KEY);

describe.skipIf(!hasKey)("together live translation batch", () => {
  it(
    `round-trips translation records through ${MODEL_ID}`,
    () => runLiveTranslations("together", `together/${MODEL_ID}`),
    LIVE_TEST_TIMEOUT_MS
  );
});
