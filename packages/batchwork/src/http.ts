import { BatchworkError } from "./errors";

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "<no body>";
  }
}

async function assertOk(url: string, init: RequestInit, response: Response) {
  if (!response.ok) {
    const detail = await safeText(response);
    throw new BatchworkError(
      `batchwork: ${init.method ?? "GET"} ${url} failed with ${response.status}: ${detail}`
    );
  }
}

/** Make a request and parse a JSON response, throwing on non-2xx. */
export async function requestJson<T>(
  url: string,
  init: RequestInit
): Promise<T> {
  const response = await fetch(url, init);
  await assertOk(url, init, response);
  return (await response.json()) as T;
}

/** Make a request and return the raw body stream, throwing on non-2xx. */
export async function requestStream(
  url: string,
  init: RequestInit
): Promise<ReadableStream<Uint8Array>> {
  const response = await fetch(url, init);
  await assertOk(url, init, response);
  if (!response.body) {
    throw new BatchworkError(`batchwork: ${url} returned an empty body.`);
  }
  return response.body;
}
