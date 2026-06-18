import { BatchworkError } from "./errors";
import { assertByteCount, byteLength } from "./limits";

const NEWLINE = "\n";
const DEFAULT_MAX_JSONL_LINE_BYTES = 20 * 1024 * 1024;

export interface JsonlParseOptions {
  maxLineBytes?: number;
}

export interface JsonlEncodeOptions {
  label?: string;
  maxBytes?: number;
}

const NEWLINE_BYTES = byteLength(NEWLINE);

const resolveMaxLineBytes = (options?: JsonlParseOptions): number => {
  const maxLineBytes = options?.maxLineBytes ?? DEFAULT_MAX_JSONL_LINE_BYTES;
  if (!(Number.isInteger(maxLineBytes) && maxLineBytes > 0)) {
    throw new BatchworkError(
      "batchwork: JSONL maxLineBytes must be a positive integer."
    );
  }
  return maxLineBytes;
};

const assertLineSize = (
  line: string,
  lineNumber: number,
  maxLineBytes: number
): void => {
  const bytes = byteLength(line);
  if (bytes > maxLineBytes) {
    throw new BatchworkError(
      `batchwork: JSONL line ${lineNumber} is ${bytes} bytes, exceeding the ${maxLineBytes} byte limit.`
    );
  }
};

const parseLine = <T>(
  line: string,
  lineNumber: number,
  maxLineBytes: number
): T | undefined => {
  assertLineSize(line, lineNumber, maxLineBytes);
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return;
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch (error) {
    throw new BatchworkError(
      `batchwork: invalid JSONL at line ${lineNumber}.`,
      { cause: error }
    );
  }
};

const resolveMaxBytes = (options?: JsonlEncodeOptions): number | undefined => {
  const maxBytes = options?.maxBytes;
  if (maxBytes !== undefined && !(Number.isInteger(maxBytes) && maxBytes > 0)) {
    throw new BatchworkError(
      "batchwork: JSONL maxBytes must be a positive integer."
    );
  }
  return maxBytes;
};

export const encodeJsonl = (
  items: readonly unknown[],
  options?: JsonlEncodeOptions
): string => {
  if (items.length === 0) {
    return "";
  }
  const lines: string[] = [];
  const maxBytes = resolveMaxBytes(options);
  const label = options?.label ?? "JSONL";
  let bytes = 0;
  for (const item of items) {
    const line = JSON.stringify(item);
    if (line === undefined) {
      throw new BatchworkError(
        `batchwork: ${label} contains a value that cannot be JSON encoded.`
      );
    }
    bytes += byteLength(line) + NEWLINE_BYTES;
    if (maxBytes !== undefined) {
      assertByteCount(label, bytes, maxBytes);
    }
    lines.push(line);
  }
  return `${lines.join(NEWLINE)}${NEWLINE}`;
};

export const parseJsonl = <T = unknown>(
  text: string,
  options?: JsonlParseOptions
): T[] => {
  const maxLineBytes = resolveMaxLineBytes(options);
  const results: T[] = [];
  const lines = text.split(NEWLINE);
  for (const [index, line] of lines.entries()) {
    const parsed = parseLine<T>(line, index + 1, maxLineBytes);
    if (parsed !== undefined) {
      results.push(parsed);
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

// oxlint-disable-next-line func-style -- generators cannot be arrow functions.
export async function* streamJsonl<T = unknown>(
  source: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>,
  options?: JsonlParseOptions
): AsyncGenerator<T> {
  const decoder = new TextDecoder();
  const maxLineBytes = resolveMaxLineBytes(options);
  let buffer = "";
  let lineNumber = 1;

  for await (const chunk of toByteIterable(source)) {
    buffer += decoder.decode(chunk, { stream: true });
    let newlineIndex = buffer.indexOf(NEWLINE);
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      const parsed = parseLine<T>(line, lineNumber, maxLineBytes);
      if (parsed !== undefined) {
        yield parsed;
      }
      lineNumber += 1;
      newlineIndex = buffer.indexOf(NEWLINE);
    }
    assertLineSize(buffer, lineNumber, maxLineBytes);
  }

  buffer += decoder.decode();
  const parsed = parseLine<T>(buffer, lineNumber, maxLineBytes);
  if (parsed !== undefined) {
    yield parsed;
  }
}
