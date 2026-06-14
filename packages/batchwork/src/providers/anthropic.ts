import { BatchworkError } from "../errors";
import { requestJson, requestStream } from "../http";
import { streamJsonl } from "../jsonl";
import type {
  BatchResult,
  BatchSnapshot,
  BatchStatus,
  BatchUsage,
  ProviderCredentials,
} from "../types";
import { asArray, asNumber, asRecord, asString, omit, toDate } from "../util";
import type { BatchAdapter, SubmitInput } from "./adapter";

const ANTHROPIC_BASE = "https://api.anthropic.com";
const ANTHROPIC_VERSION = "2023-06-01";

function apiKey(credentials: ProviderCredentials): string {
  const key = credentials.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new BatchworkError(
      "batchwork: missing Anthropic API key. Set ANTHROPIC_API_KEY or pass `apiKey`."
    );
  }
  return key;
}

function baseUrl(credentials: ProviderCredentials): string {
  return credentials.baseURL ?? ANTHROPIC_BASE;
}

function headers(credentials: ProviderCredentials): Record<string, string> {
  return {
    "x-api-key": apiKey(credentials),
    "anthropic-version": ANTHROPIC_VERSION,
    "content-type": "application/json",
    ...credentials.headers,
  };
}

function mapStatus(status: string | undefined): BatchStatus {
  if (status === "ended") {
    return "completed";
  }
  if (status === "canceling") {
    return "cancelling";
  }
  return "in_progress";
}

function normalizeSnapshot(raw: unknown): BatchSnapshot {
  const obj = asRecord(raw);
  const counts = asRecord(obj.request_counts);
  const succeeded = asNumber(counts.succeeded) ?? 0;
  const errored = asNumber(counts.errored) ?? 0;
  const processing = asNumber(counts.processing) ?? 0;
  const canceled = asNumber(counts.canceled) ?? 0;
  const expired = asNumber(counts.expired) ?? 0;

  return {
    id: asString(obj.id) ?? "",
    provider: "anthropic",
    status: mapStatus(asString(obj.processing_status)),
    requestCounts: {
      total: succeeded + errored + processing + canceled + expired,
      completed: succeeded,
      failed: errored,
      processing,
      canceled,
      expired,
    },
    createdAt: toDate(obj.created_at),
    completedAt: toDate(obj.ended_at),
    expiresAt: toDate(obj.expires_at),
    raw,
  };
}

function textFromMessage(message: unknown): string | undefined {
  const text = asArray(asRecord(message).content)
    .map((block) => asRecord(block))
    .filter((block) => block.type === "text")
    .map((block) => asString(block.text) ?? "")
    .join("");
  return text.length > 0 ? text : undefined;
}

function usageFromMessage(message: unknown): BatchUsage | undefined {
  const usage = asRecord(asRecord(message).usage);
  const inputTokens = asNumber(usage.input_tokens);
  const outputTokens = asNumber(usage.output_tokens);
  if (inputTokens === undefined && outputTokens === undefined) {
    return;
  }
  return {
    inputTokens,
    outputTokens,
    totalTokens: (inputTokens ?? 0) + (outputTokens ?? 0),
  };
}

function normalizeResult(line: unknown): BatchResult {
  const obj = asRecord(line);
  const customId = asString(obj.custom_id) ?? "";
  const result = asRecord(obj.result);
  const type = asString(result.type);

  if (type === "succeeded") {
    return {
      customId,
      status: "succeeded",
      response: result.message,
      text: textFromMessage(result.message),
      usage: usageFromMessage(result.message),
    };
  }
  if (type === "errored") {
    const inner = asRecord(asRecord(result.error).error);
    return {
      customId,
      status: "errored",
      response: result.error,
      error: {
        message: asString(inner.message) ?? "Request errored.",
        type: asString(inner.type),
      },
    };
  }
  if (type === "expired") {
    return { customId, status: "expired" };
  }
  return { customId, status: "canceled" };
}

async function submit(input: SubmitInput): Promise<BatchSnapshot> {
  const requests = input.built.map((item) => ({
    custom_id: item.customId,
    params: omit(item.body, "stream"),
  }));
  const raw = await requestJson(
    `${baseUrl(input.credentials)}/v1/messages/batches`,
    {
      method: "POST",
      headers: headers(input.credentials),
      body: JSON.stringify({ requests }),
    }
  );
  return normalizeSnapshot(raw);
}

async function retrieve(
  id: string,
  credentials: ProviderCredentials
): Promise<BatchSnapshot> {
  const raw = await requestJson(
    `${baseUrl(credentials)}/v1/messages/batches/${id}`,
    { headers: headers(credentials) }
  );
  return normalizeSnapshot(raw);
}

async function* results(
  id: string,
  credentials: ProviderCredentials
): AsyncGenerator<BatchResult> {
  const snapshot = await retrieve(id, credentials);
  const resultsUrl = asString(asRecord(snapshot.raw).results_url);
  if (!resultsUrl) {
    throw new BatchworkError(
      `batchwork: results are not ready for batch "${id}" (status: ${snapshot.status}).`
    );
  }
  const stream = await requestStream(resultsUrl, {
    headers: headers(credentials),
  });
  for await (const line of streamJsonl(stream)) {
    yield normalizeResult(line);
  }
}

async function cancel(
  id: string,
  credentials: ProviderCredentials
): Promise<void> {
  await requestJson(
    `${baseUrl(credentials)}/v1/messages/batches/${id}/cancel`,
    { method: "POST", headers: headers(credentials) }
  );
}

export const anthropicAdapter: BatchAdapter = {
  id: "anthropic",
  submit,
  retrieve,
  results,
  cancel,
};
