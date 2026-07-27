import { describe, it } from "bun:test";

import { azure } from "@ai-sdk/azure";

import {
  LIVE_TEST_TIMEOUT_MS,
  runLiveBatch,
} from "./runner";

const MODEL_ID = process.env.BATCHWORK_LIVE_AZURE_MODEL ?? "";
const hasCredentials = Boolean(
  process.env.AZURE_RESOURCE_NAME &&
  (process.env.AZURE_API_KEY || process.env.AZURE_OPENAI_API_KEY) &&
  MODEL_ID
);
describe.skipIf(!hasCredentials)("azure live batch", () => {
  it(
    `round-trips 20 records through ${MODEL_ID}`,
    () => runLiveBatch("azure", azure(MODEL_ID)),
    LIVE_TEST_TIMEOUT_MS
  );
});
