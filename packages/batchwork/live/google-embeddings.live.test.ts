import { describe, it } from "bun:test";

import { google } from "@ai-sdk/google";

import { LIVE_TEST_TIMEOUT_MS, runLiveEmbeddings } from "./runner";

const MODEL_ID =
  process.env.BATCHWORK_LIVE_GOOGLE_EMBEDDING_MODEL ?? "gemini-embedding-001";
const hasKey = Boolean(
  process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GEMINI_API_KEY
);

describe.skipIf(!hasKey)("google live embeddings batch", () => {
  it(
    `round-trips 20 records through ${MODEL_ID}`,
    () => runLiveEmbeddings("google", google.embeddingModel(MODEL_ID)),
    LIVE_TEST_TIMEOUT_MS
  );
});
