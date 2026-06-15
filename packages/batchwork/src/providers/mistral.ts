import { BatchworkError } from "../errors";
import { requestJson } from "../http";
import { encodeJsonl } from "../jsonl";
import { assertByteLength, resolveBatchLimits } from "../limits";
import type {
  BatchResult,
  BatchSnapshot,
  BatchStatus,
  ProviderCredentials,
} from "../types";
import { asNumber, asRecord, asString, omit, toDate } from "../util";
import type { BatchAdapter, SubmitInput } from "./adapter";
import { assertSimpleProviderId } from "./ids";
import { resolveApiKey, streamResultFile, uploadInputFile } from "./shared";

const MISTRAL_BASE = "https://api.mistral.ai/v1";

const apiKey = (credentials: ProviderCredentials): string =>
  resolveApiKey(credentials, "MISTRAL_API_KEY", "Mistral");

const baseUrl = (credentials: ProviderCredentials): string =>
  credentials.baseURL ?? MISTRAL_BASE;

const authHeaders = (
  credentials: ProviderCredentials
): Record<string, string> => ({
  Authorization: `Bearer ${apiKey(credentials)}`,
  ...credentials.headers,
});

const mapStatus = (status: string | undefined): BatchStatus => {
  switch (status) {
    case "QUEUED": {
      return "validating";
    }
    case "SUCCESS": {
      return "completed";
    }
    case "FAILED": {
      return "failed";
    }
    case "TIMEOUT_EXCEEDED": {
      return "expired";
    }
    case "CANCELLATION_REQUESTED": {
      return "cancelling";
    }
    case "CANCELLED": {
      return "cancelled";
    }
    default: {
      return "in_progress";
    }
  }
};

const normalizeSnapshot = (raw: unknown): BatchSnapshot => {
  const obj = asRecord(raw);
  const succeeded = asNumber(obj.succeeded_requests) ?? 0;
  const failed = asNumber(obj.failed_requests) ?? 0;
  const id = asString(obj.id) ?? "";
  return {
    completedAt: toDate(obj.completed_at),
    createdAt: toDate(obj.created_at),
    id: id ? assertSimpleProviderId("Mistral job id", id) : "",
    provider: "mistral",
    raw,
    requestCounts: {
      completed: succeeded,
      failed,
      total: asNumber(obj.total_requests) ?? succeeded + failed,
    },
    status: mapStatus(asString(obj.status)),
  };
};

const submit = async (input: SubmitInput): Promise<BatchSnapshot> => {
  const limits = resolveBatchLimits(input.limits);
  // Mistral sets the model on the job, so strip it (and `stream`) from each line.
  const jsonl = encodeJsonl(
    input.built.map((item) => ({
      body: omit(omit(item.body, "stream"), "model"),
      custom_id: item.customId,
    }))
  );
  assertByteLength("batch upload JSONL", jsonl, limits.maxUploadBytes);
  const inputFileId = await uploadInputFile(
    jsonl,
    baseUrl(input.credentials),
    authHeaders(input.credentials)
  );
  const raw = await requestJson(`${baseUrl(input.credentials)}/batch/jobs`, {
    body: JSON.stringify({
      endpoint: input.endpoint,
      input_files: [inputFileId],
      metadata: input.metadata,
      model: input.modelId,
    }),
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
  const jobId = assertSimpleProviderId("Mistral job id", id);
  const raw = await requestJson(`${baseUrl(credentials)}/batch/jobs/${jobId}`, {
    headers: authHeaders(credentials),
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
  const outputFileId = asString(raw.output_file);
  const errorFileId = asString(raw.error_file);
  const headers = authHeaders(credentials);
  if (outputFileId) {
    yield* streamResultFile(
      assertSimpleProviderId("Mistral output file id", outputFileId),
      baseUrl(credentials),
      headers
    );
  }
  if (errorFileId) {
    yield* streamResultFile(
      assertSimpleProviderId("Mistral error file id", errorFileId),
      baseUrl(credentials),
      headers
    );
  }
  if (!(outputFileId || errorFileId)) {
    throw new BatchworkError(
      `batchwork: results are not ready for batch "${id}" (status: ${snapshot.status}).`
    );
  }
}

const cancel = async (
  id: string,
  credentials: ProviderCredentials
): Promise<void> => {
  const jobId = assertSimpleProviderId("Mistral job id", id);
  await requestJson(`${baseUrl(credentials)}/batch/jobs/${jobId}/cancel`, {
    headers: authHeaders(credentials),
    method: "POST",
  });
};

/**
 * Mistral batch adapter: uploads JSONL (`purpose=batch`), creates a job with the
 * model/endpoint set on the job, polls `status`, then downloads the OpenAI-shaped
 * output/error files.
 */
export const mistralAdapter: BatchAdapter = {
  cancel,
  id: "mistral",
  results,
  retrieve,
  submit,
};
