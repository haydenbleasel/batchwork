import { createOpenAICompatibleAdapter } from "./openai-compatible";

/**
 * OpenAI batch adapter: builds JSONL, uploads it via the Files API
 * (`purpose=batch`), creates the batch, polls `status`, then downloads and
 * parses the output and error files.
 */
export const openaiAdapter = createOpenAICompatibleAdapter({
  apiKeyEnv: "OPENAI_API_KEY",
  apiKeyLabel: "OpenAI",
  baseUrl: "https://api.openai.com/v1",
  id: "openai",
  lineFormat: "method-url",
});
