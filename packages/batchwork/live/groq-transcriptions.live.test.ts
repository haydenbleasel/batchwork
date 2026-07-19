import { describe, it } from "bun:test";

import { groq } from "@ai-sdk/groq";

import { LIVE_TEST_TIMEOUT_MS, runLiveTranscriptions } from "./runner";

const MODEL_ID =
  process.env.BATCHWORK_LIVE_GROQ_TRANSCRIPTION_MODEL ?? "whisper-large-v3";
const hasKey = Boolean(process.env.GROQ_API_KEY);

describe.skipIf(!hasKey)("groq live transcription batch", () => {
  it(
    `round-trips transcription records through ${MODEL_ID}`,
    () => runLiveTranscriptions("groq", groq.transcription(MODEL_ID)),
    LIVE_TEST_TIMEOUT_MS
  );
});
