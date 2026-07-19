/**
 * Helpers shared across the OpenAI-shaped adapters (OpenAI, Groq, Together,
 * Mistral). These providers all upload JSONL via a Files API, return results as
 * JSONL keyed by `custom_id`, and shape each result line like OpenAI's
 * (`{ custom_id, response: { status_code, body }, error }`).
 */

import { BatchworkError } from "../errors";
import { requestJson, requestStream } from "../http";
import { streamJsonl } from "../jsonl";
import type {
  BatchImage,
  BatchResult,
  BatchResultError,
  BatchTranscriptionSegment,
  BatchUsage,
  ProviderCredentials,
} from "../types";
import { asArray, asNumber, asNumberArray, asRecord, asString } from "../util";

const HTTP_OK_MIN = 200;
const HTTP_OK_MAX = 300;

/** Resolve an API key from credentials or the provider's env var, or throw. */
export const resolveApiKey = (
  credentials: ProviderCredentials,
  envVar: string,
  label: string
): string => {
  const key = credentials.apiKey ?? process.env[envVar];
  if (!key) {
    throw new BatchworkError(
      `batchwork: missing ${label} API key. Set ${envVar} or pass \`apiKey\`.`
    );
  }
  return key;
};

export const textFromBody = (body: unknown): string | undefined => {
  const obj = asRecord(body);
  const choices = asArray(obj.choices);
  if (choices.length > 0) {
    const content = asString(asRecord(asRecord(choices[0]).message).content);
    if (content) {
      return content;
    }
  }
  // `text` is the top-level field of transcription responses.
  return asString(obj.output_text) ?? asString(obj.text);
};

/**
 * Read timestamped segments from a transcription-shaped response body
 * (`{ text, segments: [{ text, start, end }] }`, Groq `verbose_json` and
 * Mistral alike). Returns undefined when the body carries no segments, so
 * chat/embedding/image results are unaffected.
 */
export const segmentsFromBody = (
  body: unknown
): BatchTranscriptionSegment[] | undefined => {
  const obj = asRecord(body);
  if (asString(obj.text) === undefined) {
    return;
  }
  const segments: BatchTranscriptionSegment[] = [];
  for (const item of asArray(obj.segments)) {
    const segment = asRecord(item);
    const text = asString(segment.text);
    if (text !== undefined) {
      segments.push({
        endSecond: asNumber(segment.end),
        startSecond: asNumber(segment.start),
        text,
      });
    }
  }
  return segments.length > 0 ? segments : undefined;
};

/** Read the embedding vector from an OpenAI-shaped embeddings response body. */
export const embeddingFromBody = (body: unknown): number[] | undefined => {
  const data = asArray(asRecord(body).data);
  if (data.length === 0) {
    return;
  }
  return asNumberArray(asRecord(data[0]).embedding);
};

/**
 * Read base64 images from an OpenAI-shaped images response body
 * (`{ data: [{ b64_json }], output_format? }`). Returns undefined when the body
 * carries no image data, so chat/embedding results are unaffected.
 */
export const imagesFromBody = (body: unknown): BatchImage[] | undefined => {
  const obj = asRecord(body);
  const mediaType = `image/${asString(obj.output_format) ?? "png"}`;
  const images: BatchImage[] = [];
  for (const item of asArray(obj.data)) {
    const b64 = asString(asRecord(item).b64_json);
    if (b64) {
      images.push({ data: b64, mediaType });
    }
  }
  return images.length > 0 ? images : undefined;
};

export const usageFromBody = (body: unknown): BatchUsage | undefined => {
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

/** Normalize an OpenAI-shaped result line into a {@link BatchResult}. */
export const normalizeOpenAIResult = (line: unknown): BatchResult => {
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
      embedding: embeddingFromBody(response.body),
      images: imagesFromBody(response.body),
      response: response.body,
      segments: segmentsFromBody(response.body),
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

// Upload a JSONL batch input file and return its id. Purpose defaults to `batch`.
export const uploadInputFile = async (
  jsonl: string,
  baseUrl: string,
  headers: Record<string, string>,
  options: { purpose?: string | null } = {}
): Promise<string> => {
  const form = new FormData();
  const purpose = options.purpose === undefined ? "batch" : options.purpose;
  if (purpose !== null) {
    form.append("purpose", purpose);
  }
  form.append(
    "file",
    new Blob([jsonl], { type: "application/jsonl" }),
    "batchwork.jsonl"
  );
  const raw = await requestJson<{ id: string }>(`${baseUrl}/files`, {
    body: form,
    headers,
    method: "POST",
    redirect: "manual",
  });
  return raw.id;
};

/**
 * Stream a JSONL result file's content as normalized OpenAI-shaped results.
 *
 * @yields {BatchResult} the normalized result for each line.
 */
// oxlint-disable-next-line func-style -- generators cannot be arrow functions.
export async function* streamResultFile(
  fileId: string,
  baseUrl: string,
  headers: Record<string, string>
): AsyncGenerator<BatchResult> {
  const stream = await requestStream(`${baseUrl}/files/${fileId}/content`, {
    headers,
    redirect: "manual",
  });
  for await (const line of streamJsonl(stream)) {
    yield normalizeOpenAIResult(line);
  }
}
