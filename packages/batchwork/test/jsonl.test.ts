import { describe, expect, it } from "vitest";
import { encodeJsonl, parseJsonl, streamJsonl } from "../src/jsonl";

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

// biome-ignore lint/suspicious/useAwait: async generator only needs to yield.
async function* asyncChunks(chunks: string[]): AsyncGenerator<Uint8Array> {
  const encoder = new TextEncoder();
  for (const chunk of chunks) {
    yield encoder.encode(chunk);
  }
}

async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of source) {
    out.push(item);
  }
  return out;
}

describe("encodeJsonl / parseJsonl", () => {
  it("round-trips an array of objects", () => {
    const items = [
      { custom_id: "a", body: { model: "gpt-4o-mini" } },
      { custom_id: "b", body: { model: "gpt-4o-mini" } },
    ];
    const encoded = encodeJsonl(items);
    expect(encoded).toBe(
      `{"custom_id":"a","body":{"model":"gpt-4o-mini"}}\n{"custom_id":"b","body":{"model":"gpt-4o-mini"}}\n`
    );
    expect(parseJsonl(encoded)).toEqual(items);
  });

  it("encodes an empty array to an empty string", () => {
    expect(encodeJsonl([])).toBe("");
  });

  it("skips blank lines when parsing", () => {
    expect(parseJsonl('{"a":1}\n\n{"b":2}\n')).toEqual([{ a: 1 }, { b: 2 }]);
  });
});

describe("streamJsonl", () => {
  it("parses lines split across chunk boundaries", async () => {
    const stream = streamFromChunks(['{"x":1}\n{"y":', '2}\n{"z":3}']);
    expect(await collect(streamJsonl(stream))).toEqual([
      { x: 1 },
      { y: 2 },
      { z: 3 },
    ]);
  });

  it("accepts an async iterable of bytes", async () => {
    const source = asyncChunks(['{"a":1}\n', '{"b":2}\n']);
    expect(await collect(streamJsonl(source))).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("yields a trailing line with no final newline", async () => {
    const stream = streamFromChunks(['{"only":true}']);
    expect(await collect(streamJsonl(stream))).toEqual([{ only: true }]);
  });
});
