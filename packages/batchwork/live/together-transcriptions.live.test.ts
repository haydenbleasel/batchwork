import { describe, it } from "bun:test";

import { LIVE_TEST_TIMEOUT_MS, runLiveTranscriptions } from "./runner";

// @ai-sdk/togetherai has no transcription model, so the "provider/model"
// string form is the only way to target Together's Whisper models.
const MODEL_ID =
  process.env.BATCHWORK_LIVE_TOGETHER_TRANSCRIPTION_MODEL ??
  "openai/whisper-large-v3";
const hasKey = Boolean(process.env.TOGETHER_API_KEY);

describe.skipIf(!hasKey)("together live transcription batch", () => {
  it(
    `round-trips transcription records through ${MODEL_ID}`,
    () => runLiveTranscriptions("together", `together/${MODEL_ID}`),
    LIVE_TEST_TIMEOUT_MS
  );
});
