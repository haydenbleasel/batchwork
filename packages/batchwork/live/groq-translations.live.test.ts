import { describe, it } from "bun:test";

import { groq } from "@ai-sdk/groq";

import { LIVE_TEST_TIMEOUT_MS, runLiveTranslations } from "./runner";

// Only whisper-large-v3 supports Groq's translations endpoint (not turbo).
const MODEL_ID =
  process.env.BATCHWORK_LIVE_GROQ_TRANSLATION_MODEL ?? "whisper-large-v3";
const hasKey = Boolean(process.env.GROQ_API_KEY);

describe.skipIf(!hasKey)("groq live translation batch", () => {
  it(
    `round-trips translation records through ${MODEL_ID}`,
    () => runLiveTranslations("groq", groq.transcription(MODEL_ID)),
    LIVE_TEST_TIMEOUT_MS
  );
});
