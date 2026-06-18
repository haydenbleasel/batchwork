import { requestJson } from "../http";
import { encodeJsonl } from "../jsonl";
import { resolveBatchLimits } from "../limits";
import type {
  BatchResult,
  BatchSnapshot,
  BatchStatus,
  ProviderCredentials,
} from "../types";
import { asNumber, asRecord, asString, omit, toDate } from "../util";
import type { BatchAdapter, SubmitInput } from "./adapter";
import { assertSimpleProviderId } from "./ids";
import {
  resolveApiKey,
  textFromBody,
  uploadInputFile,
  usageFromBody,
} from "./shared";

const XAI_BASE = "https://api.x.ai/v1";
const RESULTS_PAGE_SIZE = 100;

const apiKey = (credentials: ProviderCredentials): string =>
  resolveApiKey(credentials, "XAI_API_KEY", "xAI");

const baseUrl = (credentials: ProviderCredentials): string =>
  credentials.baseURL ?? XAI_BASE;

const authHeaders = (
  credentials: ProviderCredentials
): Record<string, string> => ({
  Authorization: `Bearer ${apiKey(credentials)}`,
  ...credentials.headers,
});

const deriveStatus = (state: Record<string, unknown>): BatchStatus => {
  const pending = asNumber(state.num_pending);
  // No counts yet (e.g. immediately after creation): still processing.
  if (pending === undefined) {
    return "in_progress";
  }
  const total = asNumber(state.num_requests) ?? 0;
  const cancelled = asNumber(state.num_cancelled) ?? 0;
  if (total === 0) {
    return "in_progress";
  }
  if (pending > 0) {
    return "in_progress";
  }
  if (cancelled > 0 && cancelled === total) {
    return "cancelled";
  }
  return "completed";
};

const normalizeSnapshot = (raw: unknown): BatchSnapshot => {
  const obj = asRecord(raw);
  const state = asRecord(obj.state);
  const id = asString(obj.batch_id) ?? asString(obj.id) ?? "";
  return {
    // xAI reports the completion time on `finish_time`; `cancel_time` is only
    // set when a batch is cancelled, so it must not stand in for completedAt.
    completedAt: toDate(obj.finish_time ?? obj.completed_at),
    createdAt: toDate(obj.create_time),
    expiresAt: toDate(obj.expire_time ?? obj.expires_at),
    id: id ? assertSimpleProviderId("xAI batch id", id) : "",
    provider: "xai",
    raw,
    requestCounts: {
      canceled: asNumber(state.num_cancelled) ?? 0,
      completed: asNumber(state.num_success) ?? 0,
      failed: asNumber(state.num_error) ?? 0,
      processing: asNumber(state.num_pending) ?? 0,
      total: asNumber(state.num_requests) ?? 0,
    },
    status: deriveStatus(state),
  };
};

const normalizeResult = (item: unknown): BatchResult => {
  const obj = asRecord(item);
  const customId = asString(obj.batch_request_id) ?? "";
  const batchResult = asRecord(obj.batch_result);
  const resultError = batchResult.error;
  const errorMessage =
    asString(obj.error_message) ??
    asString(resultError) ??
    asString(asRecord(resultError).message);
  if (errorMessage) {
    return {
      customId,
      error: {
        message: errorMessage,
        type: asString(asRecord(resultError).type),
      },
      response: obj,
      status: "errored",
    };
  }
  // `batch_result.response` is keyed by operation type; chat lives under
  // `chat_get_completion`. Fall back to the first value for other op types.
  const response = asRecord(batchResult.response);
  const completion = response.chat_get_completion ?? Object.values(response)[0];
  return {
    customId,
    response: completion,
    status: "succeeded",
    text: textFromBody(completion),
    usage: usageFromBody(completion),
  };
};

const submit = async (input: SubmitInput): Promise<BatchSnapshot> => {
  const limits = resolveBatchLimits(input.limits);
  const jsonl = encodeJsonl(
    input.built.map((item) => ({
      body: omit(item.body, "stream"),
      custom_id: item.customId,
      method: "POST",
      url: input.endpoint,
    })),
    { label: "batch upload JSONL", maxBytes: limits.maxUploadBytes }
  );
  const inputFileId = await uploadInputFile(
    jsonl,
    baseUrl(input.credentials),
    authHeaders(input.credentials),
    { purpose: null }
  );
  const raw = await requestJson(`${baseUrl(input.credentials)}/batches`, {
    body: JSON.stringify({ input_file_id: inputFileId, name: "batchwork" }),
    headers: {
      ...authHeaders(input.credentials),
      "content-type": "application/json",
    },
    method: "POST",
  });
  return normalizeSnapshot(raw);
};

const retrieve = async (
  id: string,
  credentials: ProviderCredentials
): Promise<BatchSnapshot> => {
  const batchId = assertSimpleProviderId("xAI batch id", id);
  const raw = await requestJson(`${baseUrl(credentials)}/batches/${batchId}`, {
    headers: authHeaders(credentials),
  });
  return normalizeSnapshot(raw);
};

// oxlint-disable-next-line func-style -- generators cannot be arrow functions.
async function* results(
  id: string,
  credentials: ProviderCredentials
): AsyncGenerator<BatchResult> {
  const batchId = assertSimpleProviderId("xAI batch id", id);
  const headers = authHeaders(credentials);
  let token: string | undefined;
  do {
    const query = new URLSearchParams({ limit: String(RESULTS_PAGE_SIZE) });
    if (token) {
      query.set("pagination_token", token);
    }
    // oxlint-disable-next-line no-await-in-loop -- pages are read sequentially.
    const raw = await requestJson<Record<string, unknown>>(
      `${baseUrl(credentials)}/batches/${batchId}/results?${query.toString()}`,
      { headers }
    );
    const page = asRecord(raw);
    for (const item of Array.isArray(page.results) ? page.results : []) {
      yield normalizeResult(item);
    }
    token = asString(page.pagination_token);
  } while (token);
}

const cancel = async (
  id: string,
  credentials: ProviderCredentials
): Promise<void> => {
  const batchId = assertSimpleProviderId("xAI batch id", id);
  await requestJson(`${baseUrl(credentials)}/batches/${batchId}:cancel`, {
    headers: authHeaders(credentials),
    method: "POST",
  });
};

/**
 * xAI (Grok) batch adapter. Uses xAI's OpenAI-compatible file-upload path
 * (`/v1/files` + `/v1/batches` with `input_file_id`), but its status, paginated
 * `/results`, and `:cancel` shapes are proprietary.
 */
export const xaiAdapter: BatchAdapter = {
  cancel,
  id: "xai",
  results,
  retrieve,
  submit,
};
