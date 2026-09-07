import { mock } from "bun:test";

import { isString } from "../src/guards";
import type { JsonObject, JsonValue } from "../src/types";
import { asRecord, parseJson } from "../src/util";

export type FetchInput = string | URL | Request;

/** A plain fetch implementation, as the mocked transport sees it. */
export type FetchImpl = (
  input: FetchInput,
  init?: RequestInit
) => Promise<Response>;

/** One recorded call to the mocked fetch. */
export type FetchCall = Parameters<FetchImpl>;

/**
 * A canned response for the mocked transport. A string `body` is sent verbatim
 * (e.g. JSONL); anything else is JSON-encoded.
 */
export interface Route {
  body: JsonValue;
  headers?: Record<string, string>;
  match: (url: string, method: string) => boolean;
  status?: number;
}

/** The URL string a fetch call targets, whichever input form it used. */
export const requestUrl = (input: FetchInput): string =>
  input instanceof Request ? input.url : String(input);

/**
 * Adapt a plain implementation to `typeof fetch`. Bun's `fetch` declaration
 * also carries a `preconnect` member, which nothing under test calls, so a
 * no-op keeps the plain implementation assignable.
 */
export const asFetch = <Impl extends FetchImpl>(
  impl: Impl
): Impl & typeof globalThis.fetch =>
  Object.assign(impl, {
    preconnect: () => {
      // Never called under test.
    },
  });

/** Install `impl` as the global fetch and return the mock for call inspection. */
export const installFetch = (impl: FetchImpl) => {
  const fetchMock = asFetch(mock(impl));
  globalThis.fetch = fetchMock;
  return fetchMock;
};

/**
 * Install a fetch that answers from `routes` (first match wins) and rejects
 * any request nothing matches.
 */
export const installRoutes = (routes: Route[]) =>
  installFetch((input, init) => {
    const url = requestUrl(input);
    const method = init?.method ?? "GET";
    const route = routes.find((candidate) => candidate.match(url, method));
    if (!route) {
      return Promise.reject(new Error(`unexpected ${method} ${url}`));
    }
    const payload = isString(route.body)
      ? route.body
      : JSON.stringify(route.body);
    return Promise.resolve(
      new Response(payload, {
        headers: route.headers,
        status: route.status ?? 200,
      })
    );
  });

/** The multipart form a recorded call uploaded. */
export const uploadedForm = (call: FetchCall | undefined): FormData => {
  const body = call?.[1]?.body;
  if (!(body instanceof FormData)) {
    throw new Error("expected a multipart upload");
  }
  return body;
};

/** The JSONL text a recorded call uploaded as its `file` part. */
export const uploadedJsonl = async (
  call: FetchCall | undefined
): Promise<string> => {
  const file = uploadedForm(call).get("file");
  if (!(file instanceof Blob)) {
    throw new Error("expected a `file` part in the upload");
  }
  return await file.text();
};

/** Each non-empty line of an uploaded JSONL file, parsed as an object. */
export const uploadedLines = async (
  call: FetchCall | undefined
): Promise<JsonObject[]> => {
  const jsonl = await uploadedJsonl(call);
  return jsonl
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => asRecord(parseJson(line)));
};

/** Parse a JSON request body recorded by the mock. */
export const jsonBody = (call: FetchCall | undefined): JsonObject =>
  asRecord(parseJson(String(call?.[1]?.body)));
