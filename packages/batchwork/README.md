# Batchwork

A unified **batch API** for AI providers. Submit thousands of LLM requests at roughly half the cost with a single call — `batchwork` handles JSONL, file uploads, inline submission, polling, and result parsing across every major provider.

[![npm version](https://img.shields.io/npm/v/batchwork.svg)](https://www.npmjs.com/package/batchwork)
[![npm downloads](https://img.shields.io/npm/dm/batchwork.svg)](https://www.npmjs.com/package/batchwork)
[![license](https://img.shields.io/npm/l/batchwork.svg)](#license)
[![Socket Badge](https://socket.dev/api/badge/npm/package/batchwork)](https://socket.dev/npm/package/batchwork)

📖 **Full documentation: [batchwork.dev](https://batchwork.dev)**

## Install

```bash
npm install batchwork
# plus the provider package(s) you use:
npm install @ai-sdk/openai @ai-sdk/anthropic
```

`batchwork` depends only on `ai`. The `@ai-sdk/*` provider packages are **optional peer dependencies** — install only the ones you batch with. Requires Node.js 20 or newer.

## Usage

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

Author requests in the same `generateText` shape you already use, pass the AI SDK models you already use, and get back one normalized result type correlated by `customId`.

## Features

- **One API, many providers** — OpenAI, Anthropic, Google Gemini, Groq, Mistral, Together AI, and xAI.
- **AI SDK native** — author requests in the familiar `generateText` shape.
- **~50% cheaper** — every request runs against the provider's batch window.
- **Normalized results** — unified status, text, usage, and error types regardless of provider.
- **Server-ready** — optional layers for managed polling, unified webhooks, Next.js route handlers, and on-demand pooling.
- **Durable stores** — drop-in Postgres (`batchwork/postgres`) and Upstash Redis (`batchwork/redis`) adapters for the poller and pool, or bring your own.

Guides for models, the job handle, rehydration, the server layer, Next.js handlers, and pooling all live at **[batchwork.dev](https://batchwork.dev)**.

## License

[MIT](https://opensource.org/licenses/MIT) © [Hayden Bleasel](https://github.com/haydenbleasel)
