import { createOpenAICompatibleAdapter } from "./openai-compatible";

/**
 * Groq batch adapter. Groq's batch API is OpenAI-compatible (Files API +
 * `/batches`), so it reuses the OpenAI-compatible flow. Groq is served under
 * `/openai/v1`, but its batch `url` must be `/v1/chat/completions`, so the
 * captured endpoint's `/openai` prefix is stripped.
 */
export const groqAdapter = createOpenAICompatibleAdapter({
  apiKeyEnv: "GROQ_API_KEY",
  apiKeyLabel: "Groq",
  baseUrl: "https://api.groq.com/openai/v1",
  id: "groq",
  lineFormat: "method-url",
  normalizeEndpoint: (endpoint) => endpoint.replace(/^\/openai/u, ""),
});
