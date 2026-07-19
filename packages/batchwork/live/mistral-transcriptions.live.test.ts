import { describe, it } from "bun:test";

import { LIVE_TEST_TIMEOUT_MS, runLiveTranscriptions } from "./runner";

// The AI SDK's Mistral package has no transcription model, so the
// "provider/model" string form is the only way to target Voxtral.
const MODEL_ID =
  process.env.BATCHWORK_LIVE_MISTRAL_TRANSCRIPTION_MODEL ??
  "voxtral-mini-latest";
const hasKey = Boolean(process.env.MISTRAL_API_KEY);

describe.skipIf(!hasKey)("mistral live transcription batch", () => {
  it(
    `round-trips transcription records through ${MODEL_ID}`,
    () => runLiveTranscriptions("mistral", `mistral/${MODEL_ID}`),
    LIVE_TEST_TIMEOUT_MS
  );
});
