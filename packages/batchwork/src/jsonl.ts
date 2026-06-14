/**
 * JSONL (newline-delimited JSON) helpers. OpenAI batch input/output and
 * Anthropic batch results are all JSONL, so batchwork builds and parses it for
 * the user.
 */

const NEWLINE = "\n";

/** Serialize an array of values to a JSONL string (trailing newline included). */
export const encodeJsonl = (items: readonly unknown[]): string => {
  if (items.length === 0) {
    return "";
  }
  const body = items.map((item) => JSON.stringify(item)).join(NEWLINE);
  return `${body}${NEWLINE}`;
};

/** Parse a complete JSONL string into an array, skipping blank lines. */
export const parseJsonl = <T = unknown>(text: string): T[] => {
  const results: T[] = [];
  for (const line of text.split(NEWLINE)) {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      results.push(JSON.parse(trimmed) as T);
    }
  }
  return results;
};

const isReadableStream = (
  source: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>
): source is ReadableStream<Uint8Array> =>
  "getReader" in source &&
  typeof (source as ReadableStream<Uint8Array>).getReader === "function";

// oxlint-disable-next-line func-style -- generators cannot be arrow functions.
async function* toByteIterable(
  source: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>
): AsyncGenerator<Uint8Array> {
  // Prefer an explicit reader: a web `ReadableStream` (e.g. `fetch` response
  // bodies) is not reliably async-iterable at runtime across platforms.
  if (isReadableStream(source)) {
    const reader = source.getReader();
    try {
      let chunk = await reader.read();
      while (!chunk.done) {
        if (chunk.value) {
          yield chunk.value;
        }
        // oxlint-disable-next-line no-await-in-loop -- a stream is read sequentially.
        chunk = await reader.read();
      }
    } finally {
      reader.releaseLock();
    }
    return;
  }

  yield* source;
}

/**
 * Stream-parse JSONL from a byte stream, yielding one parsed value per line as
 * it arrives. Memory-efficient for large result files.
 *
 * @yields {T} the parsed value for each non-empty line.
 */
// oxlint-disable-next-line func-style -- generators cannot be arrow functions.
export async function* streamJsonl<T = unknown>(
  source: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>
): AsyncGenerator<T> {
  const decoder = new TextDecoder();
  let buffer = "";

  for await (const chunk of toByteIterable(source)) {
    buffer += decoder.decode(chunk, { stream: true });
    let newlineIndex = buffer.indexOf(NEWLINE);
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line.length > 0) {
        yield JSON.parse(line) as T;
      }
      newlineIndex = buffer.indexOf(NEWLINE);
    }
  }

  buffer += decoder.decode();
  const tail = buffer.trim();
  if (tail.length > 0) {
    yield JSON.parse(tail) as T;
  }
}
