import { describe, expect, it } from "bun:test";

import { encodeJsonl, parseJsonl, streamJsonl } from "../src/jsonl";

const streamFromChunks = (chunks: string[]): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
};

// oxlint-disable-next-line func-style -- generators cannot be arrow functions.
async function* asyncChunks(chunks: string[]): AsyncGenerator<Uint8Array> {
  const encoder = new TextEncoder();
  for (const chunk of chunks) {
    yield encoder.encode(chunk);
  }
}

const collect = async <T>(source: AsyncIterable<T>): Promise<T[]> => {
  const out: T[] = [];
  for await (const item of source) {
    out.push(item);
  }
  return out;
};

describe("encodeJsonl / parseJsonl", () => {
  it("round-trips an array of objects", () => {
    const items = [
      { body: { model: "gpt-4o-mini" }, custom_id: "a" },
      { body: { model: "gpt-4o-mini" }, custom_id: "b" },
    ];
    const encoded = encodeJsonl(items);
    expect(encoded).toBe(
      `{"body":{"model":"gpt-4o-mini"},"custom_id":"a"}\n{"body":{"model":"gpt-4o-mini"},"custom_id":"b"}\n`
    );
    expect(parseJsonl(encoded)).toStrictEqual(items);
  });

  it("encodes an empty array to an empty string", () => {
    expect(encodeJsonl([])).toBe("");
  });

  it("skips blank lines when parsing", () => {
    expect(parseJsonl('{"a":1}\n\n{"b":2}\n')).toStrictEqual([
      { a: 1 },
      { b: 2 },
    ]);
  });

  it("throws a sanitized error for malformed JSONL", () => {
    expect(() => parseJsonl('{"secret":"value"\n')).toThrow(
      "invalid JSONL at line 1"
    );
    expect(() => parseJsonl('{"secret":"value"\n')).not.toThrow(
      '"secret":"value"'
    );
  });

  it("rejects complete JSONL lines above the byte limit", () => {
    expect(() =>
      parseJsonl('{"large":"value"}\n', { maxLineBytes: 8 })
    ).toThrow("JSONL line 1");
  });
});

describe(streamJsonl, () => {
  it("parses lines split across chunk boundaries", async () => {
    const stream = streamFromChunks(['{"x":1}\n{"y":', '2}\n{"z":3}']);
    await expect(collect(streamJsonl(stream))).resolves.toStrictEqual([
      { x: 1 },
      { y: 2 },
      { z: 3 },
    ]);
  });

  it("accepts an async iterable of bytes", async () => {
    const source = asyncChunks(['{"a":1}\n', '{"b":2}\n']);
    await expect(collect(streamJsonl(source))).resolves.toStrictEqual([
      { a: 1 },
      { b: 2 },
    ]);
  });

  it("yields a trailing line with no final newline", async () => {
    const stream = streamFromChunks(['{"only":true}']);
    await expect(collect(streamJsonl(stream))).resolves.toStrictEqual([
      { only: true },
    ]);
  });

  it("throws a sanitized error for malformed streamed JSONL", async () => {
    await expect(
      collect(streamJsonl(streamFromChunks(['{"secret":"value"\n'])))
    ).rejects.toThrow("invalid JSONL at line 1");
    await expect(
      collect(streamJsonl(streamFromChunks(['{"secret":"value"\n'])))
    ).rejects.not.toThrow('"secret":"value"');
  });

  it("rejects streamed JSONL lines above the byte limit", async () => {
    const stream = streamFromChunks(['{"large":', '"value"}']);
    await expect(
      collect(streamJsonl(stream, { maxLineBytes: 8 }))
    ).rejects.toThrow("JSONL line 1");
  });
});
