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

Every major LLM provider offers a Batch API at roughly half the price — but each has a different, fiddly shape. OpenAI wants a JSONL file uploaded via the Files API; Anthropic wants an inline JSON array; both return results out of order keyed by a `custom_id`, and you poll for completion. The AI SDK unifies _synchronous_ generation but has no batch support, so today you drop out of it and hand-write provider plumbing.

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

batch({ model: openai.chat("gpt-4o-mini"), requests }); // OpenAI Chat Completions
batch({ model: openai("gpt-4o-mini"), requests }); // OpenAI Responses API
batch({ model: anthropic("claude-haiku-4-5"), requests }); // Anthropic Messages
batch({ model: "openai/gpt-4o-mini", requests }); // provider/model string
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
    {
      customId: "doc-2",
      messages: [{ role: "user", content: "…" }],
      tools: {
        /* … */
      },
    },
  ],
  metadata: { description: "nightly eval" }, // OpenAI, Groq, Together AI, Mistral
});
```

Supported per-request fields: `system`, `prompt`, `messages`, `tools`, `toolChoice`, `maxOutputTokens`, `temperature`, `topP`, `topK`, `presencePenalty`, `frequencyPenalty`, `stopSequences`, `seed`, `providerOptions`. If `customId` is omitted it defaults to `request-<index>`; values must be unique within a batch.

## The job handle

`batch()` returns immediately with a `BatchJob` — it does **not** wait for processing (which can take up to 24h).

```ts
const job = await batch({ model, requests });

job.id; // provider batch id
job.provider; // "openai" | "anthropic" | "google" | "groq" | "mistral" | "together" | "xai"
job.status; // normalized status
job.requestCounts; // { total, completed, failed, … }

await job.poll(); // refresh status once
await job.wait({ pollIntervalMs: 15_000, onPoll }); // poll until terminal
for await (const r of job.results()) {
  /* stream */
}
const all = await job.collect(); // collect into an array
await job.cancel();
```

`wait(options)` accepts `pollIntervalMs` (default `15000`), `timeoutMs`, an `AbortSignal` via `signal`, and an `onPoll(snapshot)` callback.

### Results

Results are normalized and correlated by `customId` (order is **not** guaranteed):

```ts
interface BatchResult {
  customId: string;
  status: "succeeded" | "errored" | "expired" | "canceled";
  text?: string; // normalized text output
  usage?: { inputTokens?; outputTokens?; totalTokens? };
  response?: unknown; // raw provider message / body
  error?: { message: string; type?; code? };
}
```

### Rehydrating by id

Persist `job.id` and reconnect later — no original requests needed:

```ts
import { getBatch, getBatchResults, cancelBatch } from "batchwork";

const job = await getBatch({ model: "openai/gpt-4o-mini", id: "batch_…" });
for await (const r of getBatchResults({
  model: "openai/gpt-4o-mini",
  id: "batch_…",
})) {
  /* … */
}
await cancelBatch({ model: "openai/gpt-4o-mini", id: "batch_…" });
```

## How it works

To build each provider's request body with full AI SDK fidelity (messages, tools, multimodal content, `providerOptions`) and almost no provider-specific code, `batchwork` runs each request through the AI SDK with a **capturing `fetch`** that records the serialized body and aborts before any network call. That body is exactly what `generateText` would send — it becomes the OpenAI JSONL line `body` or the Anthropic `params`. The lifecycle (upload, submit, poll, results, cancel) is plain `fetch` against each provider's batch endpoints.

Seven providers are supported, built on three batch "shapes":

| Provider      | Submit                            | Results                      |
| ------------- | --------------------------------- | ---------------------------- |
| OpenAI        | JSONL file upload → create batch  | Output + error files (JSONL) |
| Groq          | JSONL file upload (OpenAI-compat) | Output + error files (JSONL) |
| Together AI   | JSONL file upload (`body`-only)   | Output + error files (JSONL) |
| Mistral       | JSONL file upload → create job    | Output + error files (JSONL) |
| Anthropic     | Inline `requests[]` array         | `results_url` (JSONL stream) |
| Google Gemini | Inline `:batchGenerateContent`    | Inline operation responses   |
| xAI           | JSONL file upload (OpenAI-compat) | Paginated `/results` JSON    |

All run at ~50% off synchronous rates against a 24h window. OpenAI emits native webhooks; the rest are poll-only.

## Server: managed polling & unified webhooks

Instead of polling yourself, `batchwork/server` watches open batches and delivers **one signed webhook** to your endpoint when each finishes — using OpenAI's native webhooks where available and a managed poller everywhere else.

```ts
import { batch } from "batchwork";
import { createBatchPoller, createMemoryStore } from "batchwork/server";

const store = createMemoryStore(); // or a Vercel KV / Upstash / Postgres adapter
const poller = createBatchPoller({ store }); // credentials default to provider env vars

// 1. When you submit, register the batch and where to notify.
const job = await batch({ model, requests });
await poller.track(job, {
  webhookUrl: "https://acme.com/webhooks/batch",
  secret: process.env.BATCH_WEBHOOK_SECRET,
});

// 2. Run tick() on a schedule (Vercel Cron, a worker, setInterval). It polls
//    open batches and POSTs a signed event for each one that just finished.
export const GET = async () => {
  const { delivered } = await poller.tick();
  return Response.json({ delivered });
};
```

Your endpoint receives a unified, signed `BatchWebhookEvent`:

```ts
import { getBatchResults } from "batchwork";
import { verifyBatchWebhook } from "batchwork/server";

export const POST = async (request: Request) => {
  const event = await verifyBatchWebhook(
    request,
    process.env.BATCH_WEBHOOK_SECRET
  );
  // event: { type: "batch.completed" | "batch.failed" | "batch.expired"
  //          | "batch.cancelled", id, provider, requestCounts }
  for await (const r of getBatchResults({
    provider: event.provider,
    id: event.id,
  })) {
    // …persist each result
  }
  return new Response("ok");
};
```

### Skip polling for OpenAI

OpenAI emits native webhooks. Mount the handler to deliver the instant a batch completes — no `tick()` needed for OpenAI batches:

```ts
const handler = poller.openaiWebhookHandler({
  signingSecret: process.env.OPENAI_WEBHOOK_SECRET,
});
export const POST = (request: Request) => handler(request); // your OpenAI webhook route
```

## Next.js: callback route handlers

In a Next.js app you don't need to POST a webhook back to your own server — `batchwork/next` gives you App Router route handlers that poll your in-flight batches on a cron tick and call you back **in-process** when each finishes, so you persist results straight to your DB.

A Next.js `route.ts` may only export HTTP method handlers, so call `createBatchRoutes` in a regular module and re-export only `GET`/`POST` from the route file — `track` is imported from that module wherever you submit batches.

```ts
// lib/batches.ts — a normal module, importable from anywhere
import { createBatchRoutes, createMemoryStore } from "batchwork/next";

export const routes = createBatchRoutes({
  store: createMemoryStore(), // or a Vercel KV / Upstash / Postgres adapter
  // Optional: require the Vercel Cron bearer token on GET.
  cronSecret: process.env.CRON_SECRET,
  // Optional: mount OpenAI's native webhook on POST (skips polling for OpenAI).
  openaiSigningSecret: process.env.OPENAI_WEBHOOK_SECRET,
  onComplete: async (event, results) => {
    // event.type: "batch.completed" | "batch.failed" | "batch.expired" | "batch.cancelled"
    for await (const result of results) {
      await db.results.upsert({
        batchId: event.id,
        customId: result.customId,
        text: result.text,
      });
    }
  },
});
```

```ts
// app/api/batches/route.ts — re-export only the HTTP handlers
import { routes } from "@/lib/batches";

export const { GET, POST } = routes;
```

After submitting, register the batch so the cron polls it (a `BatchJob` works directly):

```ts
const job = await batch({ model, requests });
await routes.track(job);
```

Point a [Vercel Cron](https://vercel.com/docs/cron-jobs) job at the `GET` route (e.g. every few minutes). It polls each open batch and, when one reaches a terminal status, calls `onComplete` with the unified event and a **streamed** `results` iterable (empty for failure events — inspect `event.type`). The callback runs **before** the batch is marked delivered, so a throw leaves it pending and it retries next tick. Delivery is therefore **at-least-once**: make persistence idempotent (upsert keyed by `(provider, batchId, customId)`).

`onComplete` is the only required option beyond `store`. A failing batch is isolated to its own entry and reported in the `GET` response (`{ checked, delivered, failed }`) rather than aborting the tick; pass `onError` to observe these. `POST` is present only when `openaiSigningSecret` is set.

### Bring your own store

`createMemoryStore()` is for development. In production, implement `BatchStore` (four async methods: `get`, `set`, `delete`, `list`) over any KV/DB — Vercel KV, Upstash Redis, Cloudflare KV, Postgres. Make sure `list({ delivered: false })` actually filters on the delivery flag — both the poller and the Next.js cron rely on it to avoid reprocessing finished batches every tick. Signing is Standard Webhooks-compatible (`webhook-id` / `webhook-timestamp` / `webhook-signature`, HMAC-SHA256), so existing webhook tooling verifies it.

## On-demand pooling

`batch()` needs every request up front. When requests instead trickle in one at a time — say a frontend posting a single prompt per user action — `batchwork/pool` accumulates them for you and submits a batch when a **size** or **age** threshold is hit, whichever comes first.

```ts
import { createBatchPool } from "batchwork/pool";
import { openai } from "@ai-sdk/openai";

const pool = createBatchPool({
  model: openai.chat("gpt-4o-mini"),
  maxSize: 50, // flush at 50 buffered requests…
  maxDuration: 3600, // …or 3600 seconds after the first one, whichever is first
  onFlush: async (job) => {
    await job.wait();
    for (const r of await job.collect()) {
      /* … */
    }
  },
});

// Push items in as they arrive; add() returns the resolved customId.
const id = await pool.add({ prompt: "Summarize this…" });
```

`add()` returns immediately with the request's `customId` (auto-generated when omitted) — a flush can be hours away, so results come back through `onFlush(job, requests)` or, better, the [server layer](#server-managed-polling--unified-webhooks) (see below). A pool targets **one** model; create one pool per model. `maxDuration` is in **seconds** (note: not `…Ms`).

### Serverless: durable pooling + cron

In a long-running process the example above just works — the pool buffers in memory and a timer fires the age flush. But when items arrive **across serverless invocations** (the frontend case), an in-memory buffer and a `setTimeout` don't survive between requests. Pass a durable `store` and drive the age flush from your cron instead.

The pool sits **in front of** `batch()`; hand each flushed job to your existing poller/routes via `track`, and results flow back through the **same** `onComplete`/webhook path as direct `batch()` users — the pool adds no new delivery code.

```ts
// app/api/batches/route.ts
import { createBatchRoutes, createMemoryStore } from "batchwork/next";
import { createBatchPool, createMemoryPendingStore } from "batchwork/pool";
import { openai } from "@ai-sdk/openai";

const routes = createBatchRoutes({
  store: createMemoryStore(), // → KV/Postgres in production
  onComplete: async (event, results) => {
    for await (const r of results) {
      await db.results.upsert({ id: r.customId, text: r.text });
    }
  },
});

const pool = createBatchPool({
  model: openai.chat("gpt-4o-mini"),
  maxSize: 50,
  maxDuration: 3600,
  store: createMemoryPendingStore(), // → KV/Postgres in production
  track: (job) => routes.track(job), // results flow through onComplete
});

// The frontend enqueues a single item.
export const POST = async (request: Request) => {
  const { prompt, customId } = await request.json();
  return Response.json({ id: await pool.add({ customId, prompt }) });
};

// Vercel Cron: flush aged pools, then poll tracked batches.
export const GET = async (request: Request) => {
  await pool.flushDue();
  return routes.GET(request);
};
```

`pool.add()` flushes synchronously the moment the buffer reaches `maxSize`; `pool.flushDue()` (called on each cron tick) flushes once the oldest pending request has aged past `maxDuration`. Other handles: `flush()` (one batch now), `flushAll()` (drain everything), `size()`, and `close()` (stop the timer and drain — call it on graceful shutdown). If a flush fails it routes to `onError` and the claimed items return to pending for the next attempt.

### Bring your own pending store

`createMemoryPendingStore()` is for development and single-process use. For serverless, implement `PendingRequestStore` over any KV/DB. The one method that matters is `claim(poolKey, limit)`: it must **atomically** hand out a disjoint set of pending rows so two concurrent invocations never submit the same request twice — back it with Postgres `SELECT … FOR UPDATE SKIP LOCKED` (then `UPDATE … RETURNING`), or a Redis Lua `ZPOPMIN` script. Durable stores should also reclaim rows whose `claimedAt` is older than a TTL (≈ `2 × maxDuration`) so a crash between claim and submit can't strand them.

Pooled submission is therefore **at-least-once**: a flush submits the batch before deleting its claimed rows, so a crash in between leaves that batch running while the reaper returns the rows to pending — and the next flush resubmits them in a new batch. The same `customId` can then arrive under two different `batchId`s, so key your final persistence by `customId` (the value `add()` returned), not by `batchId`, and a resubmission overwrites rather than duplicates.

## Roadmap

- **Amazon Bedrock** and **Vertex AI** — their batch APIs need object-storage staging (S3/GCS) and cloud IAM auth, which don't fit batchwork's `apiKey` + `fetch` model yet.
- Embeddings batches.

## License

MIT © Hayden Bleasel
