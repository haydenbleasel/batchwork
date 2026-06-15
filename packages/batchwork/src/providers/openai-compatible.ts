/**
 * Factory for OpenAI-compatible batch adapters. OpenAI, Groq, and Together AI
 * all share the same lifecycle — upload JSONL via the Files API, create a batch
 * referencing the file, poll a `status` field, then download output/error files
 * — differing only in base URL, credentials, and minor request-line shape.
 */

import { BatchworkError } from "../errors";
import { requestJson } from "../http";
import { encodeJsonl } from "../jsonl";
import { assertByteLength, resolveBatchLimits } from "../limits";
import type {
  BatchProvider,
  BatchResult,
  BatchSnapshot,
  BatchStatus,
  ProviderCredentials,
} from "../types";
import { asNumber, asRecord, asString, omit, toDate } from "../util";
import type { BatchAdapter, SubmitInput } from "./adapter";
import { assertSimpleProviderId } from "./ids";
import { resolveApiKey, streamResultFile, uploadInputFile } from "./shared";

// How a batch input line is shaped.
export type BatchLineFormat = "body-only" | "method-url";

export interface OpenAICompatibleConfig {
  apiKeyEnv: string;
  apiKeyLabel: string;
  baseUrl: string;
  // How long the provider may take to finish (OpenAI/Groq/Together).
  completionWindow?: string;
  // Files API purpose value for uploaded JSONL batch inputs.
  filePurpose?: string;
  id: BatchProvider;
  /**
   * Override the JSONL upload. Defaults to a direct multipart POST to the Files
   * API (OpenAI, Groq); Together replaces it with its presigned-URL flow.
   * Returns the uploaded file id.
   */
  uploadFile?: (args: {
    baseUrl: string;
    headers: Record<string, string>;
    jsonl: string;
    purpose: string;
  }) => Promise<string>;
  /**
   * Input-line shape. `method-url` writes `{ custom_id, method, url, body }`
   * (OpenAI, Groq); `body-only` writes `{ custom_id, body }` (Together).
   */
  lineFormat?: BatchLineFormat;
  /**
   * Map the captured endpoint path to the value the provider expects in the
   * batch `url`/`endpoint` field (e.g. Groq serves under `/openai/v1` but its
   * batch `url` must be `/v1/chat/completions`).
   */
  normalizeEndpoint?: (endpoint: string) => string;
}

const DEFAULT_COMPLETION_WINDOW = "24h";

const mapStatus = (status: string | undefined): BatchStatus => {
  const normalized = status?.toLowerCase();
  switch (normalized) {
    case "validating":
    case "in_progress":
    case "finalizing":
    case "completed":
    case "failed":
    case "expired":
    case "cancelling":
    case "cancelled": {
      return normalized;
    }
    default: {
      return "in_progress";
    }
  }
};

const normalizeSnapshot = (
  raw: unknown,
  provider: BatchProvider
): BatchSnapshot => {
  const outer = asRecord(raw);
  const obj = asRecord(outer.job);
  const source = Object.keys(obj).length > 0 ? obj : outer;
  const counts = asRecord(source.request_counts);
  return {
    completedAt: toDate(source.completed_at),
    createdAt: toDate(source.created_at),
    expiresAt: toDate(source.expires_at),
    id: asString(source.id) ?? "",
    provider,
    raw: source,
    requestCounts: {
      completed: asNumber(counts.completed) ?? 0,
      failed: asNumber(counts.failed) ?? 0,
      total: asNumber(counts.total) ?? 0,
    },
    status: mapStatus(asString(source.status)),
  };
};

// Build an OpenAI-compatible adapter from a provider config.
export const createOpenAICompatibleAdapter = (
  config: OpenAICompatibleConfig
): BatchAdapter => {
  const completionWindow = config.completionWindow ?? DEFAULT_COMPLETION_WINDOW;
  const lineFormat = config.lineFormat ?? "method-url";

  const baseUrl = (credentials: ProviderCredentials): string =>
    credentials.baseURL ?? config.baseUrl;

  const authHeaders = (
    credentials: ProviderCredentials
  ): Record<string, string> => ({
    Authorization: `Bearer ${resolveApiKey(credentials, config.apiKeyEnv, config.apiKeyLabel)}`,
    ...credentials.headers,
  });

  const submit = async (input: SubmitInput): Promise<BatchSnapshot> => {
    const limits = resolveBatchLimits(input.limits);
    const endpoint = config.normalizeEndpoint
      ? config.normalizeEndpoint(input.endpoint)
      : input.endpoint;
    const jsonl = encodeJsonl(
      input.built.map((item) => {
        const body = omit(item.body, "stream");
        if (lineFormat === "body-only") {
          return { body, custom_id: item.customId };
        }
        return {
          body,
          custom_id: item.customId,
          method: "POST",
          url: endpoint,
        };
      })
    );
    assertByteLength("batch upload JSONL", jsonl, limits.maxUploadBytes);
    const headers = authHeaders(input.credentials);
    const url = baseUrl(input.credentials);
    const purpose = config.filePurpose ?? "batch";
    const inputFileId = await (config.uploadFile
      ? config.uploadFile({ baseUrl: url, headers, jsonl, purpose })
      : uploadInputFile(jsonl, url, headers, { purpose }));
    const raw = await requestJson(`${url}/batches`, {
      body: JSON.stringify({
        completion_window: completionWindow,
        endpoint,
        input_file_id: inputFileId,
        metadata: input.metadata,
      }),
      headers: { ...headers, "content-type": "application/json" },
      method: "POST",
    });
    return normalizeSnapshot(raw, config.id);
  };

  const retrieve = async (
    id: string,
    credentials: ProviderCredentials
  ): Promise<BatchSnapshot> => {
    const batchId = assertSimpleProviderId(`${config.id} batch id`, id);
    const raw = await requestJson(
      `${baseUrl(credentials)}/batches/${batchId}`,
      {
        headers: authHeaders(credentials),
      }
    );
    return normalizeSnapshot(raw, config.id);
  };

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
    const headers = authHeaders(credentials);
    if (outputFileId) {
      yield* streamResultFile(
        assertSimpleProviderId(`${config.id} output file id`, outputFileId),
        baseUrl(credentials),
        headers
      );
    }
    if (errorFileId) {
      yield* streamResultFile(
        assertSimpleProviderId(`${config.id} error file id`, errorFileId),
        baseUrl(credentials),
        headers
      );
    }
  }

  const cancel = async (
    id: string,
    credentials: ProviderCredentials
  ): Promise<void> => {
    const batchId = assertSimpleProviderId(`${config.id} batch id`, id);
    await requestJson(`${baseUrl(credentials)}/batches/${batchId}/cancel`, {
      headers: authHeaders(credentials),
      method: "POST",
    });
  };

  return { cancel, id: config.id, results, retrieve, submit };
};
