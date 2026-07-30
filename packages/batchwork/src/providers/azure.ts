import { BatchworkError } from "../errors";
import type { ProviderCredentials } from "../types";
import { createOpenAICompatibleAdapter } from "./openai-compatible";

const withoutTrailingSlash = (value: string): string =>
  value.replace(/\/+$/u, "");

const isAzureOpenAIUrl = (value: string): boolean => {
  try {
    return new URL(value).hostname.endsWith(".openai.azure.com");
  } catch {
    return false;
  }
};

const baseUrl = (credentials: ProviderCredentials): string => {
  const configured =
    credentials.baseURL ??
    (process.env.AZURE_RESOURCE_NAME
      ? `https://${process.env.AZURE_RESOURCE_NAME}.openai.azure.com/openai`
      : undefined);
  if (!configured) {
    throw new BatchworkError(
      "batchwork: missing Azure OpenAI resource. Set AZURE_RESOURCE_NAME or pass `baseURL`."
    );
  }

  const normalized = withoutTrailingSlash(configured);
  if (!isAzureOpenAIUrl(normalized)) {
    return normalized;
  }
  // Accept the bare resource URL, its `/openai` URL, or its `/openai/v1` API
  // root — batch calls always need the full `/openai/v1` root.
  if (normalized.endsWith("/v1")) {
    return normalized;
  }
  return normalized.endsWith("/openai")
    ? `${normalized}/v1`
    : `${normalized}/openai/v1`;
};

const hasCallerAuth = (headers: Record<string, string> | undefined): boolean =>
  Object.keys(headers ?? {}).some((name) => {
    const normalized = name.toLowerCase();
    return normalized === "api-key" || normalized === "authorization";
  });

const authHeaders = (
  credentials: ProviderCredentials
): Record<string, string> => {
  if (credentials.apiKey) {
    return { "api-key": credentials.apiKey };
  }
  if (hasCallerAuth(credentials.headers)) {
    return {};
  }
  const apiKey = process.env.AZURE_API_KEY ?? process.env.AZURE_OPENAI_API_KEY;
  if (apiKey) {
    return { "api-key": apiKey };
  }
  throw new BatchworkError(
    "batchwork: missing Azure OpenAI API key. Set AZURE_API_KEY or pass `apiKey`."
  );
};

/**
 * Azure OpenAI batch adapter. Azure uses OpenAI's JSONL Files + Batches shape,
 * with a resource-specific `/openai/v1` API root and `api-key` authentication.
 * Input lines use `/v1/...`, while batch creation uses `/v1/chat/completions`
 * for text batches (including Responses input).
 */
export const azureAdapter = createOpenAICompatibleAdapter({
  apiKeyEnv: "AZURE_API_KEY",
  apiKeyLabel: "Azure OpenAI",
  authHeaders,
  // Azure batch creation only accepts `/v1/chat/completions` for text batches
  // and, unlike OpenAI, does not validate JSONL line URLs against it — so
  // Responses input lines (`/v1/responses`) ride on this endpoint. Verified
  // against a live Global Batch deployment; revisit if Azure adds validation
  // or a `/v1/responses` batch endpoint.
  batchEndpoint: () => "/v1/chat/completions",
  id: "azure",
  normalizeEndpoint: (endpoint) => endpoint.replace(/^\/openai/u, ""),
  resolveBaseUrl: baseUrl,
});
