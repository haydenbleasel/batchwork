# Batchwork

A unified **batch API** for AI providers. Submit thousands of LLM requests at roughly half the cost with a single call — `batchwork` handles JSONL, file uploads, inline submission, polling, and result parsing across every major provider.

[![npm downloads](https://img.shields.io/npm/dm/batchwork.svg)](https://www.npmjs.com/package/batchwork) [![license](https://img.shields.io/npm/l/batchwork.svg)](#license) [![Socket Badge](https://socket.dev/api/badge/npm/package/batchwork)](https://socket.dev/npm/package/batchwork) ![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/haydenbleasel/batchwork?utm_source=oss&utm_medium=github&utm_campaign=haydenbleasel%2Fbatchwork&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)

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
  model: openai.chat("gpt-5.5"),
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

## Embeddings

Batch embeddings work the same way — pass a text embedding model and `value`s, and get one vector per request back on `result.embedding`:

```ts
import { batch } from "batchwork";
import { openai } from "@ai-sdk/openai";

const job = await batch.embeddings({
  model: openai.embeddingModel("text-embedding-3-small"),
  requests: [
    { customId: "a", value: "The quick brown fox." },
    { customId: "b", value: "A lazy dog sleeps." },
  ],
});

const results = await job.wait().then(() => job.collect());
for (const r of results) {
  console.log(r.customId, r.embedding?.length);
}
```

Batch embeddings are available for **OpenAI, Mistral, and Google Gemini** — the providers whose batch API accepts embeddings. The rest throw a clear error: Anthropic, Groq, and xAI have no embedding model, and Together AI's batch API doesn't accept the embeddings endpoint.

## Images

Generate images in bulk — pass an image model and `prompt`s, and get base64 images back on `result.images`:

```ts
import { batch } from "batchwork";
import { openai } from "@ai-sdk/openai";

const job = await batch.images({
  model: openai.image("gpt-image-2"),
  requests: [
    { customId: "a", prompt: "A red bicycle against a brick wall." },
    { customId: "b", prompt: "A watercolor painting of a sleeping cat." },
  ],
});

const results = await job.wait().then(() => job.collect());
for (const r of results) {
  for (const image of r.images ?? []) {
    // Inline base64 (`image.data` + `image.mediaType`), or a hosted
    // `image.url` for providers that return one (e.g. xAI batch).
    console.log(r.customId, image.mediaType ?? image.url);
  }
}
```

Batch image generation is available for **OpenAI** (`/v1/images/generations`, e.g. `gpt-image-2`), **Google Gemini** image models (e.g. `gemini-3.1-flash-image`), and **xAI** (`/v1/images/generations`, e.g. `grok-imagine-image-quality`); other providers throw a clear error. Google's Imagen models aren't batch-supported, and Together AI's batch API is chat/audio only. OpenAI and Google return inline base64 on `image.data`; xAI batch returns signed `image.url`s that **expire ~1h** after completion, so download them promptly.

Image **editing** works too, on OpenAI and xAI, via `batch.images.edit()` (`batch.images.create()` is an alias of `batch.images()`). Source images are passed as JSON references — uploaded `fileId`s (OpenAI) or hosted `imageUrl`s — with an optional `mask` on OpenAI:

```ts
const job = await batch.images.edit({
  model: openai.image("gpt-image-2"),
  requests: [
    {
      customId: "a",
      prompt: "Make the bicycle blue.",
      images: [{ imageUrl: "https://example.com/bicycle.png" }],
    },
  ],
});
```

## Videos

Generate videos in bulk — pass a video model and `prompt`s, and get signed video URLs back on `result.videos`:

```ts
import { batch } from "batchwork";
import { xai } from "@ai-sdk/xai";

const job = await batch.videos({
  model: xai.video("grok-imagine-video"),
  requests: [
    { customId: "a", prompt: "A red bicycle rolling downhill.", duration: 5 },
  ],
});

const results = await job.wait().then(() => job.collect());
for (const r of results) {
  console.log(r.customId, r.videos?.[0]?.url);
}
```

Batch video generation is available for **xAI** (Grok Imagine via `/v1/videos/generations`, plus editing and extension through `providerOptions.xai`); other providers throw a clear error — OpenAI's Videos API (Sora) is deprecated (shutting down September 2026) and Google's Veo models aren't batch-supported. Results are signed URLs that **expire ~1h** after completion, so download them promptly.

## Transcriptions

Transcribe audio in bulk — pass a transcription model and hosted audio URLs, and get transcripts back on `result.text`:

```ts
import { batch } from "batchwork";
import { groq } from "@ai-sdk/groq";

const job = await batch.transcriptions({
  model: groq.transcription("whisper-large-v3"),
  requests: [
    { customId: "a", audioUrl: "https://example.com/interview.wav" },
    { customId: "b", audioUrl: "https://example.com/standup.mp3" },
  ],
});

const results = await job.wait().then(() => job.collect());
for (const r of results) {
  console.log(r.customId, r.text);
}
```

Batch transcription is available for **Groq** (`whisper-large-v3`, audio by `url`), **Mistral** (Voxtral models, e.g. `"mistral/voxtral-mini-latest"`, audio by `file_url`), and **Together AI** (Whisper models, e.g. `"together/openai/whisper-large-v3"`, audio by `file`); other providers throw a clear error — OpenAI's batch API doesn't accept its audio endpoints. Batch audio endpoints take **hosted URLs only** (no file uploads), so each `audioUrl` must stay reachable while the batch processes. Request `timestampGranularities: ["segment"]` to also get timestamped spans on `result.segments`.

`batch.translations()` runs Whisper's **translate** task instead — audio in any language, English text out — on **Groq** (`whisper-large-v3` only) and **Together AI**, with the same request shape minus `language`.

## Moderations

Moderate content in bulk — pass a moderation model and texts (or image URLs, OpenAI omni moderation only), and get verdicts back on `result.moderation`:

```ts
import { batch } from "batchwork";

const job = await batch.moderations({
  model: "openai/omni-moderation-latest",
  requests: [
    { customId: "a", value: "What a lovely day for a picnic." },
    { customId: "b", value: "…user-generated content…" },
  ],
});

const results = await job.wait().then(() => job.collect());
for (const r of results) {
  console.log(r.customId, r.moderation?.flagged, r.moderation?.categories);
}
```

Batch moderation is available for **OpenAI** (`omni-moderation-latest`, text + images) and **Mistral** (`mistral-moderation-latest`, text-only); other providers throw a clear error. Models are passed as `"provider/model"` strings (the AI SDK has no moderation model type). Category names are provider-native; `flagged` is the provider's own flag (OpenAI) or "any category flagged" (Mistral).

## Features

- **One API, many providers** — OpenAI, Anthropic, Google Gemini, Groq, Mistral, Together AI, and xAI.
- **AI SDK native** — author requests in the familiar `generateText` shape.
- **Chat, embeddings, images, video, audio & moderation** — `batch()` for completions, `batch.embeddings()` for vectors, `batch.images()` for image generation, `batch.videos()` for video generation, `batch.transcriptions()` for audio transcription, `batch.moderations()` for content moderation.
- **~50% cheaper** — every request runs against the provider's batch window.
- **Normalized results** — unified status, text, usage, and error types regardless of provider.
- **Server-ready** — optional layers for managed polling, unified webhooks, and Next.js route handlers.
- **Durable stores** — drop-in Postgres (`batchwork/postgres`) and Upstash Redis (`batchwork/redis`) adapters for the poller, or bring your own.

Guides for models, the job handle, rehydration, the server layer, and Next.js handlers all live at **[batchwork.dev](https://batchwork.dev)**.

## License

[MIT](https://opensource.org/licenses/MIT) © [Hayden Bleasel](https://github.com/haydenbleasel)
