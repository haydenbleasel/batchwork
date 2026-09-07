import { afterEach, describe, expect, it } from "bun:test";

import { requestJson, requestStream } from "../src/http";
import { installFetch } from "./fetch-mock";

const originalFetch = globalThis.fetch;

/** Install a fetch that answers every call with `respond`. */
const install = (respond: () => Promise<Response>) => installFetch(respond);

/**
 * Install a fetch resolving to a partial `Response` stand-in that carries only
 * the members under test.
 */
const installPartial = (response: Partial<Response>) => {
  // SAFETY: `requestJson`/`requestStream` read only `ok`, `status`, `body`,
  // and `text` from a response, and each stand-in supplies exactly the members
  // its test exercises.
  const stub = response as Response;
  return installFetch(() => Promise.resolve(stub));
};

describe("requestJson", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("parses a JSON body on success", async () => {
    install(() =>
      Promise.resolve(new Response('{"ok":true}', { status: 200 }))
    );
    await expect(requestJson("https://x.test/y", {})).resolves.toEqual({
      ok: true,
    });
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
    installPartial({
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
    installPartial({ body: null, ok: true, status: 200 });
    await expect(requestStream("https://x.test/y", {})).rejects.toThrow(
      "returned an empty body"
    );
  });
});
