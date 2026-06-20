import { describe, it } from "bun:test";

import { openai } from "@ai-sdk/openai";

import { LIVE_TEST_TIMEOUT_MS, runLiveEmbeddings } from "./runner";

const MODEL_ID =
  process.env.BATCHWORK_LIVE_OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
const hasKey = Boolean(process.env.OPENAI_API_KEY);

describe.skipIf(!hasKey)("openai live embeddings batch", () => {
  it(
    `round-trips 20 records through ${MODEL_ID}`,
    () => runLiveEmbeddings("openai", openai.embeddingModel(MODEL_ID)),
    LIVE_TEST_TIMEOUT_MS
  );
});
