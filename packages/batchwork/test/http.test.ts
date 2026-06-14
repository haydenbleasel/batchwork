import { afterEach, describe, expect, it, mock } from "bun:test";

import { requestJson, requestStream } from "../src/http";

const originalFetch = globalThis.fetch;

/** Install a fetch that returns the given response object for any call. */
const install = (response: Partial<Response> | (() => Promise<Response>)) => {
  const fetchMock = mock(() =>
    typeof response === "function"
      ? response()
      : Promise.resolve(response as Response)
  );
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  return fetchMock;
};

describe("requestJson", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("parses a JSON body on success", async () => {
    install(() =>
      Promise.resolve(new Response('{"ok":true}', { status: 200 }))
    );
    await expect(
      requestJson<{ ok: boolean }>("https://x.test/y", {})
    ).resolves.toEqual({ ok: true });
  });

  it("throws with the method, url, status, and body on failure", async () => {
    install(() =>
      Promise.resolve(
        new Response("upstream is sad", {
          status: 503,
        })
      )
    );
    await expect(
      requestJson("https://x.test/y", { method: "POST" })
    ).rejects.toThrow("POST https://x.test/y failed with 503: upstream is sad");
  });

  it("falls back to <no body> when the error body cannot be read", async () => {
    install({
      ok: false,
      status: 500,
      text: () => Promise.reject(new Error("stream broke")),
    });
    await expect(requestJson("https://x.test/y", {})).rejects.toThrow(
      "GET https://x.test/y failed with 500: <no body>"
    );
  });
});

describe("requestStream", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns the raw body stream on success", async () => {
    install(() => Promise.resolve(new Response("a\nb\n", { status: 200 })));
    const stream = await requestStream("https://x.test/y", {});
    expect(stream).toBeInstanceOf(ReadableStream);
  });

  it("throws on a non-2xx response", async () => {
    install(() => Promise.resolve(new Response("nope", { status: 404 })));
    await expect(requestStream("https://x.test/y", {})).rejects.toThrow(
      "failed with 404"
    );
  });

  it("throws when the body is empty", async () => {
    install({ body: null, ok: true, status: 200 });
    await expect(requestStream("https://x.test/y", {})).rejects.toThrow(
      "returned an empty body"
    );
  });
});
