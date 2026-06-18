import { describe, it } from "bun:test";

import { mistral } from "@ai-sdk/mistral";

import { LIVE_TEST_TIMEOUT_MS, runLiveEmbeddings } from "./runner";

const MODEL_ID =
  process.env.BATCHWORK_LIVE_MISTRAL_EMBEDDING_MODEL ?? "mistral-embed";
const hasKey = Boolean(process.env.MISTRAL_API_KEY);

describe.skipIf(!hasKey)("mistral live embeddings batch", () => {
  it(
    `round-trips 20 records through ${MODEL_ID}`,
    () => runLiveEmbeddings("mistral", mistral.textEmbeddingModel(MODEL_ID)),
    LIVE_TEST_TIMEOUT_MS
  );
});
