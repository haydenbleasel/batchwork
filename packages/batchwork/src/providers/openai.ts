import { BatchworkError } from "../errors";
import { requestJson, requestStream } from "../http";
import { encodeJsonl, streamJsonl } from "../jsonl";
import type {
  BatchResult,
  BatchResultError,
  BatchSnapshot,
  BatchStatus,
  BatchUsage,
  ProviderCredentials,
} from "../types";
import { asArray, asNumber, asRecord, asString, omit, toDate } from "../util";
import type { BatchAdapter, SubmitInput } from "./adapter";

const OPENAI_BASE = "https://api.openai.com/v1";
const COMPLETION_WINDOW = "24h";
const HTTP_OK_MIN = 200;
const HTTP_OK_MAX = 300;

const apiKey = (credentials: ProviderCredentials): string => {
  const key = credentials.apiKey ?? process.env.OPENAI_API_KEY;
  if (!key) {
    throw new BatchworkError(
      "batchwork: missing OpenAI API key. Set OPENAI_API_KEY or pass `apiKey`."
    );
  }
  return key;
};

const baseUrl = (credentials: ProviderCredentials): string =>
  credentials.baseURL ?? OPENAI_BASE;

const authHeaders = (
  credentials: ProviderCredentials
): Record<string, string> => ({
  Authorization: `Bearer ${apiKey(credentials)}`,
  ...credentials.headers,
});

const jsonHeaders = (
  credentials: ProviderCredentials
): Record<string, string> => ({
  ...authHeaders(credentials),
  "content-type": "application/json",
});

const mapStatus = (status: string | undefined): BatchStatus => {
  switch (status) {
    case "validating":
    case "in_progress":
    case "finalizing":
    case "completed":
    case "failed":
    case "expired":
    case "cancelling":
    case "cancelled": {
      return status;
    }
    default: {
      return "in_progress";
    }
  }
};

const normalizeSnapshot = (raw: unknown): BatchSnapshot => {
  const obj = asRecord(raw);
  const counts = asRecord(obj.request_counts);
  return {
    completedAt: toDate(obj.completed_at),
    createdAt: toDate(obj.created_at),
    expiresAt: toDate(obj.expires_at),
    id: asString(obj.id) ?? "",
    provider: "openai",
    raw,
    requestCounts: {
      completed: asNumber(counts.completed) ?? 0,
      failed: asNumber(counts.failed) ?? 0,
      total: asNumber(counts.total) ?? 0,
    },
    status: mapStatus(asString(obj.status)),
  };
};

const textFromBody = (body: unknown): string | undefined => {
  const obj = asRecord(body);
  const choices = asArray(obj.choices);
  if (choices.length > 0) {
    const content = asString(asRecord(asRecord(choices[0]).message).content);
    if (content) {
      return content;
    }
  }
  return asString(obj.output_text);
};

const usageFromBody = (body: unknown): BatchUsage | undefined => {
  const usage = asRecord(asRecord(body).usage);
  const inputTokens =
    asNumber(usage.prompt_tokens) ?? asNumber(usage.input_tokens);
  const outputTokens =
    asNumber(usage.completion_tokens) ?? asNumber(usage.output_tokens);
  const totalTokens = asNumber(usage.total_tokens);
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

const errorFromValue = (value: unknown, fallback: string): BatchResultError => {
  const obj = asRecord(value);
  const nested = asRecord(obj.error);
  const source = nested.message ? nested : obj;
  return {
    code: asNumber(source.code) ?? asString(source.code),
    message: asString(source.message) ?? fallback,
    type: asString(source.type),
  };
};

const normalizeResult = (line: unknown): BatchResult => {
  const obj = asRecord(line);
  const customId = asString(obj.custom_id) ?? "";

  if (obj.error) {
    return {
      customId,
      error: errorFromValue(obj.error, "Request errored."),
      response: obj.error,
      status: "errored",
    };
  }

  const response = asRecord(obj.response);
  const statusCode = asNumber(response.status_code) ?? 0;
  if (statusCode >= HTTP_OK_MIN && statusCode < HTTP_OK_MAX) {
    return {
      customId,
      response: response.body,
      status: "succeeded",
      text: textFromBody(response.body),
      usage: usageFromBody(response.body),
    };
  }

  return {
    customId,
    error: errorFromValue(
      response.body,
      `Request failed with status ${statusCode}.`
    ),
    response: response.body,
    status: "errored",
  };
};

const uploadInputFile = async (
  jsonl: string,
  credentials: ProviderCredentials
): Promise<string> => {
  const form = new FormData();
  form.append("purpose", "batch");
  form.append(
    "file",
    new Blob([jsonl], { type: "application/jsonl" }),
    "batchwork.jsonl"
  );
  const raw = await requestJson<{ id: string }>(
    `${baseUrl(credentials)}/files`,
    {
      body: form,
      headers: authHeaders(credentials),
      method: "POST",
    }
  );
  return raw.id;
};

const submit = async (input: SubmitInput): Promise<BatchSnapshot> => {
  const jsonl = encodeJsonl(
    input.built.map((item) => ({
      body: omit(item.body, "stream"),
      custom_id: item.customId,
      method: "POST",
      url: input.endpoint,
    }))
  );
  const inputFileId = await uploadInputFile(jsonl, input.credentials);
  const raw = await requestJson(`${baseUrl(input.credentials)}/batches`, {
    body: JSON.stringify({
      completion_window: COMPLETION_WINDOW,
      endpoint: input.endpoint,
      input_file_id: inputFileId,
      metadata: input.metadata,
    }),
    headers: jsonHeaders(input.credentials),
    method: "POST",
  });
  return normalizeSnapshot(raw);
};

const retrieve = async (
  id: string,
  credentials: ProviderCredentials
): Promise<BatchSnapshot> => {
  const raw = await requestJson(`${baseUrl(credentials)}/batches/${id}`, {
    headers: authHeaders(credentials),
  });
  return normalizeSnapshot(raw);
};

// oxlint-disable-next-line func-style -- generators cannot be arrow functions.
async function* streamFile(
  fileId: string,
  credentials: ProviderCredentials
): AsyncGenerator<BatchResult> {
  const stream = await requestStream(
    `${baseUrl(credentials)}/files/${fileId}/content`,
    { headers: authHeaders(credentials) }
  );
  for await (const line of streamJsonl(stream)) {
    yield normalizeResult(line);
  }
}

// oxlint-disable-next-line func-style -- generators cannot be arrow functions.
async function* results(
  id: string,
  credentials: ProviderCredentials
): AsyncGenerator<BatchResult> {
  const snapshot = await retrieve(id, credentials);
  const raw = asRecord(snapshot.raw);
  const outputFileId = asString(raw.output_file_id);
  const errorFileId = asString(raw.error_file_id);

  if (!(outputFileId || errorFileId)) {
    throw new BatchworkError(
      `batchwork: results are not ready for batch "${id}" (status: ${snapshot.status}).`
    );
  }
  if (outputFileId) {
    yield* streamFile(outputFileId, credentials);
  }
  if (errorFileId) {
    yield* streamFile(errorFileId, credentials);
  }
}

const cancel = async (
  id: string,
  credentials: ProviderCredentials
): Promise<void> => {
  await requestJson(`${baseUrl(credentials)}/batches/${id}/cancel`, {
    headers: authHeaders(credentials),
    method: "POST",
  });
};

export const openaiAdapter: BatchAdapter = {
  cancel,
  id: "openai",
  results,
  retrieve,
  submit,
};
