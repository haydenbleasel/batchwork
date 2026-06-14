# batchwork

The missing **batch API** for the [Vercel AI SDK](https://ai-sdk.dev). Submit thousands of requests at ~50% cost with one unified call — `batchwork` handles JSONL, file uploads, inline submission, polling, and result parsing across providers.

```ts
import { batch } from "batchwork";
import { openai } from "@ai-sdk/openai";

const job = await batch({
  model: openai.chat("gpt-4o-mini"),
  requests: [
    { customId: "a", prompt: "Summarize: …" },
    { customId: "b", messages: [{ role: "user", content: "Translate: …" }] },
  ],
});

const results = await job.wait().then(() => job.collect());
for (const r of results) {
  console.log(r.customId, r.status, r.text);
}
```

## Why

Every major LLM provider offers a Batch API at roughly half the price — but each has a different, fiddly shape. OpenAI wants a JSONL file uploaded via the Files API; Anthropic wants an inline JSON array; both return results out of order keyed by a `custom_id`, and you poll for completion. The AI SDK unifies *synchronous* generation but has no batch support, so today you drop out of it and hand-write provider plumbing.

`batchwork` closes that gap. You author requests in the same `generateText` shape you already use, pass the same AI SDK models, and get back one normalized result type.

## Install

```bash
npm install batchwork
# plus the provider package(s) you use:
npm install @ai-sdk/openai @ai-sdk/anthropic
```

`batchwork` depends on `ai`. The `@ai-sdk/*` provider packages are **optional peer dependencies** — install only the ones you batch with.

Set credentials via the standard environment variables (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`) or pass `apiKey` to `batch()`.

## Models

`model` accepts anything the AI SDK does:

```ts
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";

batch({ model: openai.chat("gpt-4o-mini"), requests });   // OpenAI Chat Completions
batch({ model: openai("gpt-4o-mini"), requests });        // OpenAI Responses API
batch({ model: anthropic("claude-haiku-4-5"), requests });// Anthropic Messages
batch({ model: "openai/gpt-4o-mini", requests });         // provider/model string
```

> **Gateway string caveat.** A `"provider/model"` string is supported for ergonomics and resolves to the provider's **native** batch API using your provider credentials. Batch traffic does **not** route through the Vercel AI Gateway (which has no batch endpoint), so you need the provider key (e.g. `OPENAI_API_KEY`), not just a gateway key.

## Requests

Each request mirrors `generateText` (minus `model`), plus a `customId` used to correlate its result. Provide `prompt` or `messages`.

```ts
await batch({
  model: anthropic("claude-haiku-4-5"),
  // Defaults are merged into every request (request-level values win).
  defaults: { system: "You are terse.", maxOutputTokens: 256 },
  requests: [
    { customId: "doc-1", prompt: "…", temperature: 0 },
    { customId: "doc-2", messages: [{ role: "user", content: "…" }], tools: { /* … */ } },
  ],
  metadata: { description: "nightly eval" }, // OpenAI only
});
```

Supported per-request fields: `system`, `prompt`, `messages`, `tools`, `toolChoice`, `maxOutputTokens`, `temperature`, `topP`, `topK`, `presencePenalty`, `frequencyPenalty`, `stopSequences`, `seed`, `providerOptions`. If `customId` is omitted it defaults to `request-<index>`; values must be unique within a batch.

## The job handle

`batch()` returns immediately with a `BatchJob` — it does **not** wait for processing (which can take up to 24h).

```ts
const job = await batch({ model, requests });

job.id;             // provider batch id
job.provider;       // "openai" | "anthropic"
job.status;         // normalized status
job.requestCounts;  // { total, completed, failed, … }

await job.poll();                                   // refresh status once
await job.wait({ pollIntervalMs: 15_000, onPoll }); // poll until terminal
for await (const r of job.results()) { /* stream */ }
const all = await job.collect();                    // collect into an array
await job.cancel();
```

`wait(options)` accepts `pollIntervalMs` (default `15000`), `timeoutMs`, an `AbortSignal` via `signal`, and an `onPoll(snapshot)` callback.

### Results

Results are normalized and correlated by `customId` (order is **not** guaranteed):

```ts
interface BatchResult {
  customId: string;
  status: "succeeded" | "errored" | "expired" | "canceled";
  text?: string;                        // normalized text output
  usage?: { inputTokens?; outputTokens?; totalTokens? };
  response?: unknown;                   // raw provider message / body
  error?: { message: string; type?; code? };
}
```

### Rehydrating by id

Persist `job.id` and reconnect later — no original requests needed:

```ts
import { getBatch, getBatchResults, cancelBatch } from "batchwork";

const job = await getBatch({ model: "openai/gpt-4o-mini", id: "batch_…" });
for await (const r of getBatchResults({ model: "openai/gpt-4o-mini", id: "batch_…" })) { /* … */ }
await cancelBatch({ model: "openai/gpt-4o-mini", id: "batch_…" });
```

## How it works

To build each provider's request body with full AI SDK fidelity (messages, tools, multimodal content, `providerOptions`) and almost no provider-specific code, `batchwork` runs each request through the AI SDK with a **capturing `fetch`** that records the serialized body and aborts before any network call. That body is exactly what `generateText` would send — it becomes the OpenAI JSONL line `body` or the Anthropic `params`. The lifecycle (upload, submit, poll, results, cancel) is plain `fetch` against each provider's batch endpoints.

| | OpenAI | Anthropic |
| --- | --- | --- |
| Submit | JSONL file upload → create batch | Inline `requests[]` array |
| Status | Poll (native webhooks exist) | Poll only |
| Limits | 50k reqs / 200 MB | 100k reqs / 256 MB |
| Discount | ~50% | ~50% |

## Roadmap

- **Server layer** (`batchwork/server`): a managed poller + one unified webhook for batch completion across providers (using native webhooks where they exist).
- More providers (Gemini, Mistral, Groq, Bedrock) via the same adapter interface.
- Embeddings batches.

## License

MIT © Hayden Bleasel
