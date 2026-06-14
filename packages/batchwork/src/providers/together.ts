import { createOpenAICompatibleAdapter } from "./openai-compatible";

/**
 * Together AI batch adapter. Together's batch API mirrors OpenAI's (Files API +
 * `/batches`) but uses the leaner `{ custom_id, body }` input-line shape, with
 * the endpoint declared on the batch rather than per line.
 */
export const togetherAdapter = createOpenAICompatibleAdapter({
  apiKeyEnv: "TOGETHER_API_KEY",
  apiKeyLabel: "Together AI",
  baseUrl: "https://api.together.xyz/v1",
  filePurpose: "batch-api",
  id: "together",
  lineFormat: "body-only",
});
