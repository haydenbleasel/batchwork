import { BatchworkError } from "./errors";
import type { JsonValue } from "./types";
import { parseJson } from "./util";

const assertOk = (url: string, init: RequestInit, response: Response) => {
  if (!response.ok) {
    throw new BatchworkError(
      `batchwork: ${init.method ?? "GET"} ${url} failed with ${response.status}.`
    );
  }
};

/** Make a request and parse its JSON response body, throwing on non-2xx. */
export const requestJson = async (
  url: string,
  init: RequestInit
): Promise<JsonValue> => {
  const response = await fetch(url, init);
  assertOk(url, init, response);
  return parseJson(await response.text());
};

/** Make a request and return the raw body stream, throwing on non-2xx. */
export const requestStream = async (
  url: string,
  init: RequestInit
): Promise<ReadableStream<Uint8Array>> => {
  const response = await fetch(url, init);
  assertOk(url, init, response);
  if (!response.body) {
    throw new BatchworkError(`batchwork: ${url} returned an empty body.`);
  }
  return response.body;
};
