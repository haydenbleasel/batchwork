import { BatchworkError } from "../errors";
import { requestJson, requestStream } from "../http";
import { streamJsonl } from "../jsonl";
import { assertByteLength, resolveBatchLimits } from "../limits";
import type {
  BatchResult,
  BatchSnapshot,
  BatchStatus,
  BatchUsage,
  ProviderCredentials,
} from "../types";
import { asArray, asNumber, asRecord, asString, omit, toDate } from "../util";
import type { BatchAdapter, SubmitInput } from "./adapter";
import { assertSimpleProviderId } from "./ids";

const ANTHROPIC_BASE = "https://api.anthropic.com";
const ANTHROPIC_VERSION = "2023-06-01";

const apiKey = (credentials: ProviderCredentials): string => {
  const key = credentials.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new BatchworkError(
      "batchwork: missing Anthropic API key. Set ANTHROPIC_API_KEY or pass `apiKey`."
    );
  }
  return key;
};

const baseUrl = (credentials: ProviderCredentials): string =>
  credentials.baseURL ?? ANTHROPIC_BASE;

const validateResultsUrl = (
  rawUrl: string,
  credentials: ProviderCredentials
): string => {
  let resultsUrl: URL;
  let expectedBase: URL;
  try {
    resultsUrl = new URL(rawUrl);
    expectedBase = new URL(baseUrl(credentials));
  } catch (error) {
    throw new BatchworkError("batchwork: invalid Anthropic results_url.", {
      cause: error,
    });
  }
  if (resultsUrl.origin !== expectedBase.origin) {
    throw new BatchworkError(
      "batchwork: Anthropic results_url must match the configured API origin."
    );
  }
  if (resultsUrl.username || resultsUrl.password) {
    throw new BatchworkError(
      "batchwork: Anthropic results_url must not include credentials."
    );
  }
  return resultsUrl.toString();
};

const headers = (credentials: ProviderCredentials): Record<string, string> => ({
  "anthropic-version": ANTHROPIC_VERSION,
  "content-type": "application/json",
  "x-api-key": apiKey(credentials),
  ...credentials.headers,
});

const mapStatus = (status: string | undefined): BatchStatus => {
  if (status === "ended") {
    return "completed";
  }
  if (status === "canceling") {
    return "cancelling";
  }
  return "in_progress";
};

const normalizeSnapshot = (raw: unknown): BatchSnapshot => {
  const obj = asRecord(raw);
  const counts = asRecord(obj.request_counts);
  const succeeded = asNumber(counts.succeeded) ?? 0;
  const errored = asNumber(counts.errored) ?? 0;
  const processing = asNumber(counts.processing) ?? 0;
  const canceled = asNumber(counts.canceled) ?? 0;
  const expired = asNumber(counts.expired) ?? 0;

  return {
    completedAt: toDate(obj.ended_at),
    createdAt: toDate(obj.created_at),
    expiresAt: toDate(obj.expires_at),
    id: asString(obj.id) ?? "",
    provider: "anthropic",
    raw,
    requestCounts: {
      canceled,
      completed: succeeded,
      expired,
      failed: errored,
      processing,
      total: succeeded + errored + processing + canceled + expired,
    },
    status: mapStatus(asString(obj.processing_status)),
  };
};

const textFromMessage = (message: unknown): string | undefined => {
  const text = asArray(asRecord(message).content)
    .map((block) => asRecord(block))
    .filter((block) => block.type === "text")
    .map((block) => asString(block.text) ?? "")
    .join("");
  return text.length > 0 ? text : undefined;
};

const usageFromMessage = (message: unknown): BatchUsage | undefined => {
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
};

const normalizeResult = (line: unknown): BatchResult => {
  const obj = asRecord(line);
  const customId = asString(obj.custom_id) ?? "";
  const result = asRecord(obj.result);
  const type = asString(result.type);

  if (type === "succeeded") {
    return {
      customId,
      response: result.message,
      status: "succeeded",
      text: textFromMessage(result.message),
      usage: usageFromMessage(result.message),
    };
  }
  if (type === "errored") {
    const error = asRecord(result.error);
    const nested = asRecord(error.error);
    const source = Object.keys(nested).length > 0 ? nested : error;
    return {
      customId,
      error: {
        message: asString(source.message) ?? "Request errored.",
        type: asString(source.type),
      },
      response: result.error,
      status: "errored",
    };
  }
  if (type === "expired") {
    return { customId, status: "expired" };
  }
  return { customId, status: "canceled" };
};

const submit = async (input: SubmitInput): Promise<BatchSnapshot> => {
  const limits = resolveBatchLimits(input.limits);
  const requests = input.built.map((item) => ({
    custom_id: item.customId,
    params: omit(item.body, "stream"),
  }));
  const body = JSON.stringify({ requests });
  assertByteLength("batch upload payload", body, limits.maxUploadBytes);
  const raw = await requestJson(
    `${baseUrl(input.credentials)}/v1/messages/batches`,
    {
      body,
      headers: headers(input.credentials),
      method: "POST",
    }
  );
  return normalizeSnapshot(raw);
};

const retrieve = async (
  id: string,
  credentials: ProviderCredentials
): Promise<BatchSnapshot> => {
  const batchId = assertSimpleProviderId("Anthropic batch id", id);
  const raw = await requestJson(
    `${baseUrl(credentials)}/v1/messages/batches/${batchId}`,
    { headers: headers(credentials) }
  );
  return normalizeSnapshot(raw);
};

// oxlint-disable-next-line func-style -- generators cannot be arrow functions.
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
  const stream = await requestStream(
    validateResultsUrl(resultsUrl, credentials),
    {
      headers: headers(credentials),
    }
  );
  for await (const line of streamJsonl(stream)) {
    yield normalizeResult(line);
  }
}

const cancel = async (
  id: string,
  credentials: ProviderCredentials
): Promise<void> => {
  const batchId = assertSimpleProviderId("Anthropic batch id", id);
  await requestJson(
    `${baseUrl(credentials)}/v1/messages/batches/${batchId}/cancel`,
    {
      headers: headers(credentials),
      method: "POST",
    }
  );
};

export const anthropicAdapter: BatchAdapter = {
  cancel,
  id: "anthropic",
  results,
  retrieve,
  submit,
};
