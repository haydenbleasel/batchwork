import { BatchworkError } from "../errors";
import { requestJson } from "../http";
import { assertByteLength, resolveBatchLimits } from "../limits";
import type {
  BatchResult,
  BatchSnapshot,
  BatchStatus,
  BatchUsage,
  ProviderCredentials,
} from "../types";
import { asArray, asNumber, asRecord, asString, omit } from "../util";
import type { BatchAdapter, SubmitInput } from "./adapter";

const GOOGLE_BASE = "https://generativelanguage.googleapis.com/v1beta";

const apiKey = (credentials: ProviderCredentials): string => {
  const key =
    credentials.apiKey ??
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
    process.env.GEMINI_API_KEY;
  if (!key) {
    throw new BatchworkError(
      "batchwork: missing Google Gemini API key. Set GOOGLE_GENERATIVE_AI_API_KEY (or GEMINI_API_KEY) or pass `apiKey`."
    );
  }
  return key;
};

const baseUrl = (credentials: ProviderCredentials): string =>
  credentials.baseURL ?? GOOGLE_BASE;

const headers = (credentials: ProviderCredentials): Record<string, string> => ({
  "content-type": "application/json",
  "x-goog-api-key": apiKey(credentials),
  ...credentials.headers,
});

/** Gemini operation state. Live ops use `JOB_STATE_*`; match on the suffix. */
const mapState = (state: string | undefined, done: boolean): BatchStatus => {
  if (state) {
    if (state.endsWith("SUCCEEDED")) {
      return "completed";
    }
    if (state.endsWith("FAILED")) {
      return "failed";
    }
    if (state.endsWith("CANCELLED")) {
      return "cancelled";
    }
    if (state.endsWith("EXPIRED")) {
      return "expired";
    }
    if (state.endsWith("PENDING")) {
      return "validating";
    }
    if (state.endsWith("RUNNING")) {
      return "in_progress";
    }
  }
  return done ? "completed" : "in_progress";
};

const inlinedResponses = (raw: unknown): unknown[] => {
  const obj = asRecord(raw);
  const response = asRecord(obj.response);
  const dest = asRecord(obj.dest);
  const responseInline =
    response.inlinedResponses ?? response.inlined_responses;
  const destInline = dest.inlinedResponses ?? dest.inlined_responses;
  const nestedResponseInline = asRecord(responseInline);
  const nestedDestInline = asRecord(destInline);
  return [
    ...asArray(responseInline),
    ...asArray(nestedResponseInline.inlinedResponses),
    ...asArray(nestedResponseInline.inlined_responses),
    ...asArray(destInline),
    ...asArray(nestedDestInline.inlinedResponses),
    ...asArray(nestedDestInline.inlined_responses),
  ];
};

const normalizeSnapshot = (raw: unknown): BatchSnapshot => {
  const obj = asRecord(raw);
  const items = inlinedResponses(raw);
  const failed = items.filter((item) => asRecord(item).error).length;
  return {
    id: asString(obj.name) ?? "",
    provider: "google",
    raw,
    requestCounts: {
      completed: items.length - failed,
      failed,
      total: items.length,
    },
    status: mapState(
      asString(obj.state) ??
        asString(asRecord(obj.state).name) ??
        asString(asRecord(obj.metadata).state),
      obj.done === true
    ),
  };
};

const textFromResponse = (response: unknown): string | undefined => {
  const candidate = asRecord(asArray(asRecord(response).candidates)[0]);
  const text = asArray(asRecord(candidate.content).parts)
    .map((part) => asString(asRecord(part).text) ?? "")
    .join("");
  return text.length > 0 ? text : undefined;
};

const usageFromResponse = (response: unknown): BatchUsage | undefined => {
  const usage = asRecord(asRecord(response).usageMetadata);
  const inputTokens = asNumber(usage.promptTokenCount);
  const outputTokens = asNumber(usage.candidatesTokenCount);
  const totalTokens = asNumber(usage.totalTokenCount);
  if (
    inputTokens === undefined &&
    outputTokens === undefined &&
    totalTokens === undefined
  ) {
    return;
  }
  return {
    inputTokens,
    outputTokens,
    totalTokens: totalTokens ?? (inputTokens ?? 0) + (outputTokens ?? 0),
  };
};

const normalizeResult = (item: unknown): BatchResult => {
  const obj = asRecord(item);
  const customId =
    asString(asRecord(obj.metadata).key) ??
    asString(obj.key) ??
    asString(obj.custom_id) ??
    "";
  if (obj.error) {
    const error = asRecord(obj.error);
    return {
      customId,
      error: {
        code: asNumber(error.code) ?? asString(error.code),
        message: asString(error.message) ?? "Request errored.",
        type: asString(error.status),
      },
      response: obj.error,
      status: "errored",
    };
  }
  return {
    customId,
    response: obj.response,
    status: "succeeded",
    text: textFromResponse(obj.response),
    usage: usageFromResponse(obj.response),
  };
};

const submit = async (input: SubmitInput): Promise<BatchSnapshot> => {
  const limits = resolveBatchLimits(input.limits);
  const requests = input.built.map((item) => ({
    metadata: { key: item.customId },
    request: omit(item.body, "stream"),
  }));
  const body = JSON.stringify({
    batch: {
      display_name: "batchwork",
      input_config: { requests: { requests } },
    },
  });
  assertByteLength("batch upload payload", body, limits.maxUploadBytes);
  const raw = await requestJson(
    `${baseUrl(input.credentials)}/models/${input.modelId}:batchGenerateContent`,
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
  const raw = await requestJson(`${baseUrl(credentials)}/${id}`, {
    headers: headers(credentials),
  });
  return normalizeSnapshot(raw);
};

// oxlint-disable-next-line func-style -- generators cannot be arrow functions.
async function* results(
  id: string,
  credentials: ProviderCredentials
): AsyncGenerator<BatchResult> {
  const snapshot = await retrieve(id, credentials);
  const raw = asRecord(snapshot.raw);
  const response = asRecord(raw.response);
  const dest = asRecord(raw.dest);
  const responsesFile =
    asString(asRecord(response.responsesFile).name) ??
    asString(response.responsesFile) ??
    asString(asRecord(response.responses_file).name) ??
    asString(response.responses_file) ??
    asString(dest.fileName) ??
    asString(dest.file_name);
  if (responsesFile) {
    throw new BatchworkError(
      `batchwork: batch "${id}" returned file-mode results, which are not supported yet.`
    );
  }
  const items = inlinedResponses(raw);
  if (items.length === 0) {
    throw new BatchworkError(
      `batchwork: results are not ready for batch "${id}" (status: ${snapshot.status}).`
    );
  }
  for (const item of items) {
    yield normalizeResult(item);
  }
}

const cancel = async (
  id: string,
  credentials: ProviderCredentials
): Promise<void> => {
  await requestJson(`${baseUrl(credentials)}/${id}:cancel`, {
    headers: headers(credentials),
    method: "POST",
  });
};

/**
 * Google Gemini (Developer API) batch adapter: submits inline requests via
 * `:batchGenerateContent`, polls the returned long-running operation, then reads
 * the inline responses keyed by each request's `metadata.key`.
 */
export const googleAdapter: BatchAdapter = {
  cancel,
  id: "google",
  results,
  retrieve,
  submit,
};
