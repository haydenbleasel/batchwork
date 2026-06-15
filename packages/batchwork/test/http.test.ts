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

  it("throws with the method, url, and status on failure", async () => {
    install(() =>
      Promise.resolve(
        new Response("upstream is sad", {
          status: 503,
        })
      )
    );
    await expect(
      requestJson("https://x.test/y", { method: "POST" })
    ).rejects.toThrow("POST https://x.test/y failed with 503.");
  });

  it("does not read or leak provider error bodies", async () => {
    let read = false;
    install({
      ok: false,
      status: 500,
      text: () => {
        read = true;
        return Promise.resolve("secret prompt");
      },
    });
    let message = "";
    try {
      await requestJson("https://x.test/y", {});
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toBe("batchwork: GET https://x.test/y failed with 500.");
    expect(message).not.toContain("secret prompt");
    expect(read).toBe(false);
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
