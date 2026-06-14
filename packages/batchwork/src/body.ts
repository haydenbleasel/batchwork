import { generateText, type LanguageModel } from "ai";

type GenerateTextInput = Parameters<typeof generateText>[0];

import { BatchworkError } from "./errors";
import {
  type CapturingFetch,
  createCaptureModel,
  type ResolvedModel,
} from "./model";
import type { BatchDefaults, BatchRequest, ProviderCredentials } from "./types";

/** A provider request body derived from a single batch item. */
export interface BuiltRequest {
  /** The serialized provider request body (becomes the batch line). */
  body: Record<string, unknown>;
  customId: string;
  /** API endpoint path the model targets, e.g. `/v1/chat/completions`. */
  endpoint: string;
}

const MAX_CAUSE_DEPTH = 10;

/**
 * Thrown by the capturing `fetch` to abort the request after its body has been
 * serialized. The body travels inside the error (not shared state), so capture
 * is correct even under concurrency.
 */
class CaptureSignal extends Error {
  readonly url: string;
  readonly rawBody: string;

  constructor(url: string, rawBody: string) {
    super("batchwork:capture");
    this.name = "CaptureSignal";
    this.url = url;
    this.rawBody = rawBody;
  }
}

function resolveUrl(input: string | URL | Request): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

function extractBody(init?: RequestInit): string {
  const body = init?.body;
  if (typeof body === "string") {
    return body;
  }
  if (body instanceof Uint8Array) {
    return new TextDecoder().decode(body);
  }
  throw new BatchworkError(
    "batchwork: unable to read the provider request body during capture."
  );
}

const captureFetch: CapturingFetch = (input, init) =>
  Promise.reject(new CaptureSignal(resolveUrl(input), extractBody(init)));

function findCapture(error: unknown): CaptureSignal | undefined {
  let current: unknown = error;
  let depth = 0;
  while (current && depth < MAX_CAUSE_DEPTH) {
    if (current instanceof CaptureSignal) {
      return current;
    }
    current = (current as { cause?: unknown }).cause;
    depth += 1;
  }
  return;
}

function endpointFromUrl(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function mergeDefaults(
  request: BatchRequest,
  defaults: BatchDefaults | undefined
): BatchRequest {
  if (!defaults) {
    return request;
  }
  return { ...defaults, ...request };
}

/**
 * Map a batch request to AI SDK `generateText` input. Fields are listed
 * explicitly so `customId` never leaks into the provider request.
 */
function toGenerateInput(
  model: LanguageModel,
  request: BatchRequest
): GenerateTextInput {
  // `prompt`/`messages` form a discriminated union in the AI SDK types; we
  // pass both keys and let `generateText` validate the XOR at runtime.
  return {
    model,
    maxRetries: 0,
    system: request.system,
    prompt: request.prompt,
    messages: request.messages,
    tools: request.tools,
    toolChoice: request.toolChoice,
    maxOutputTokens: request.maxOutputTokens,
    temperature: request.temperature,
    topP: request.topP,
    topK: request.topK,
    presencePenalty: request.presencePenalty,
    frequencyPenalty: request.frequencyPenalty,
    stopSequences: request.stopSequences,
    providerOptions: request.providerOptions,
    seed: request.seed,
  } as GenerateTextInput;
}

async function captureOne(
  model: LanguageModel,
  request: BatchRequest,
  customId: string
): Promise<BuiltRequest> {
  try {
    await generateText(toGenerateInput(model, request));
  } catch (error) {
    const capture = findCapture(error);
    if (capture) {
      return {
        body: JSON.parse(capture.rawBody) as Record<string, unknown>,
        customId,
        endpoint: endpointFromUrl(capture.url),
      };
    }
    // A genuine failure (e.g. invalid prompt) — surface it to the caller.
    throw error;
  }
  throw new BatchworkError(
    "batchwork: the request was not intercepted while building the batch body."
  );
}

/**
 * Derive provider request bodies for every batch item by running each through
 * the AI SDK with a capturing `fetch`. This reuses the AI SDK's full message,
 * tool, and multimodal conversion, so the body matches what `generateText`
 * would send — minus the network call.
 */
export async function buildRequestBodies(
  resolved: ResolvedModel,
  requests: readonly BatchRequest[],
  defaults: BatchDefaults | undefined,
  credentials: ProviderCredentials
): Promise<BuiltRequest[]> {
  const model = await createCaptureModel(resolved, credentials, captureFetch);
  const built: BuiltRequest[] = [];
  const seen = new Set<string>();

  for (const [index, request] of requests.entries()) {
    const customId = request.customId ?? `request-${index}`;
    if (seen.has(customId)) {
      throw new BatchworkError(
        `batchwork: duplicate customId "${customId}". customId values must be unique within a batch.`
      );
    }
    seen.add(customId);
    built.push(
      await captureOne(model, mergeDefaults(request, defaults), customId)
    );
  }

  return built;
}
