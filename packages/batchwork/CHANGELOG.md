# batchwork

## 1.3.0

### Minor Changes

- 37d8011: Add Together AI to `batch.transcriptions()` — Whisper models (e.g. `"together/openai/whisper-large-v3"`) batch through `/v1/audio/transcriptions`, with Batchwork writing Together's audio-specific `method: "FILE"` lines and `body.file` URL references automatically.
- cab0f91: Add `batch.translations()` — batch audio translation to English (Whisper's translate task) for Groq (`whisper-large-v3`) and Together AI (`"together/openai/whisper-large-v3"`) via `/v1/audio/translations`. Mirrors `batch.transcriptions()` minus the `language` field (English is the only target); English text lands on `result.text` with optional timestamped `result.segments`. Mistral batches transcriptions but not translations and throws `UnsupportedProviderError`.
- 164a64d: Add `batch.transcriptions()` — batch audio transcription for Groq (`whisper-large-v3`) and Mistral (Voxtral models). Pass hosted audio URLs (batch audio endpoints accept URLs, not file uploads); transcripts land on `result.text`, with timestamped spans on `result.segments` when `timestampGranularities` is requested. Includes new `BatchTranscriptionRequest`/`BatchTranscriptionOptions`/`BatchTranscriptionSegment` types and an `UnsupportedProviderError` gate for providers whose batch API rejects audio endpoints.
- f2dfa3b: Add `batch.moderations()` — batch content moderation for OpenAI (`omni-moderation-latest`, text + image inputs) and Mistral (`mistral-moderation-latest`, text-only). Pass models as `"provider/model"` strings; verdicts land on `result.moderation` as `{ flagged, categories, categoryScores }` with provider-native category names (Mistral's missing top-level flag is computed as "any category flagged"). Includes new `BatchModerationRequest`/`BatchModerationOptions`/`BatchModeration` types and an `UnsupportedProviderError` gate for providers without a moderation endpoint.
- 977dbb0: Add `batch.images.edit()` — batch image editing for OpenAI and xAI via `/v1/images/edits`. Source images are passed as JSON asset references (`{ fileId }` from the OpenAI Files API or `{ imageUrl }`), with an optional `mask` on OpenAI; xAI takes URL references only and rejects masks/file ids before any network request. `batch.images.create()` is added as an explicit alias of `batch.images()`, which continues to work unchanged. Edited images land on `result.images` exactly like generation.
- 3a4334a: Add `batch.videos()` — batch video generation for xAI (Grok Imagine). Prompts go through `/v1/videos/generations`, with per-line routing to `/v1/videos/edits` and `/v1/videos/extensions` via `providerOptions.xai` (`videoUrl`, `mode: "extend-video"`, `referenceImageUrls`), mirroring the AI SDK's `experimental_generateVideo`. Results land on `result.videos` as signed URLs that expire ~1h after completion. OpenAI's Videos API (Sora) is deliberately unsupported — it is deprecated and shuts down September 2026 — and Google's Veo models are not batch-compatible; both throw `UnsupportedProviderError`.

## 1.2.1

### Patch Changes

- 113dea8: Bump all dependencies. The AI SDK moves to the v4 provider spec: `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/groq`, `@ai-sdk/mistral`, `@ai-sdk/openai` and `@ai-sdk/xai` to `^4`, `@ai-sdk/togetherai` to `^3`, and the `ai` core to `^7` (required so the core recognises the new `LanguageModelV4`/`EmbeddingModelV4`/`ImageModelV4` specification). Peer ranges are unchanged, so existing installs keep working. All remaining dev and tooling dependencies (TypeScript, `@types/node`, `pg`/`@electric-sql/pglite`, oxlint/ultracite, Turborepo, Remotion) are also brought up to date.

## 1.2.0

### Minor Changes

- fd40b65: Add `batchImages()` for batch image-generation requests. It returns the same `BatchJob` handle as `batch()`, with each `prompt` producing one or more images correlated by `customId`, and exposes them on a new `BatchResult.images` field (inline base64 `data`/`mediaType`, or a hosted `url`). Supported on OpenAI (`/v1/images/generations`), Google Gemini image models (`:batchGenerateContent`), and xAI (`/v1/images/generations`); other providers throw `UnsupportedProviderError`. Generation only — image editing and Imagen models aren't batch-supported.
- c073c1a: Add a unified `batch.*` namespace: `batch.text()`, `batch.embeddings()`, and `batch.images()`. `batch()` remains a callable shorthand for `batch.text()`. The standalone `batchEmbeddings()` and `batchImages()` exports are now deprecated aliases for `batch.embeddings()` and `batch.images()` respectively, and will be removed in a future major.

## 1.1.0

### Minor Changes

- b92aa39: Add `batchEmbeddings()` for batch embedding requests. It returns the same `BatchJob` handle as `batch()`, with one vector per request correlated by `customId`, and exposes the vector on a new `BatchResult.embedding` field. Supported on OpenAI, Mistral, and Google Gemini (Anthropic, Groq, and xAI have no embedding model, and Together's batch API doesn't accept the embeddings endpoint).

### Patch Changes

- 6dd605a: Enforce captured provider request byte limits before parsing the captured body so oversized requests are rejected before JSON allocation.
- ec523e0: Fix `BatchJob.wait()` leaking `abort` event listeners on the provided `AbortSignal`. The internal delay attached a listener each poll but only removed it on abort, so a long-running wait accumulated one dangling listener per poll interval. The listener is now detached when the delay resolves normally.
- af7a1a0: Reject redirects during direct provider file uploads so multipart JSONL request bodies cannot be replayed to redirected destinations.
- 29d0d71: Fix webhook and Together upload URL validation rejecting legitimate hostnames that begin with `fc`/`fd` (e.g. `fc2.com`). The private-IPv6 guard now only applies to actual IPv6 literals (those containing a colon), so bare DNS names are no longer mistaken for `fc00::/7` addresses.
- 7d44c0a: Reject redirects while downloading provider result files so result URL and file-id validation cannot be bypassed by a redirected response.
- 9d610fe: Fix `toDate` returning an `Invalid Date` for empty or malformed provider timestamps. Such a value previously survived into a snapshot and threw `RangeError: Invalid time value` when the date was serialized (e.g. building a webhook event); the field is now coerced to `undefined` instead.
- 397c95d: Reject redirects during Together presigned PUT uploads so JSONL batch bodies cannot be replayed after the initial upload URL validation.
- 7e702cd: Check aggregate upload byte limits while encoding provider payloads so oversized JSONL and inline batch submissions are rejected before full payload materialization.
- 1c12f63: Block IPv4-mapped IPv6 literals in the default webhook URL validator so mapped loopback and private-network destinations cannot bypass the private IPv4 checks.
- 4054ff0: Harden webhook replay tracking by supporting atomic replay-store claims and serializing legacy async replay stores per webhook id to prevent concurrent signed replays.
- ac706ba: Fix the xAI batch snapshot reporting `completedAt` from the batch's `cancel_time`. A normally-completed batch now reads its completion timestamp from `finish_time`, and `completedAt` is left unset for batches that were never cancelled but had no finish time (rather than surfacing a misleading cancellation time).

## 1.0.1

### Patch Changes

- a8d4f19: Add configurable request count, request byte, upload byte, and capture concurrency limits for batch creation.
- 52d0ca5: Redact upstream provider response bodies from BatchworkError messages.
- e9a6ab8: Validate OpenAI-compatible batch and file ids before using them in provider API paths.
- 65b177d: Reject replayed webhook ids during webhook signature verification.
- 06b5d24: Keep Anthropic result downloads on the configured provider origin.
- 6e06892: Validate Google Gemini operation ids before using them in provider API paths.
- 4f91af8: Validate Mistral job and file ids before using them in provider API paths.
- 893d23b: Require explicit authorization or opt-in for Next.js cron polling routes.
- c2b6837: Prevent webhook delivery from following redirects after URL validation.
- 671df48: Validate default poller webhook destinations before tracking and delivery.
- 88471d8: Validate Anthropic batch ids before using them in provider API paths.
- 2153cae: Validate Together presigned upload locations before sending JSONL bytes.
- 9a5b126: Cap JSONL parser line sizes and wrap malformed JSONL in sanitized Batchwork errors.
- 8ed4a04: Restrict the CI workflow's `GITHUB_TOKEN` to `contents: read`, resolving the missing workflow permissions code-scanning alert.
- 723dc99: Validate xAI batch ids before using them in provider API paths.
- 67098ba: Validate the OpenAI request host by exact hostname comparison instead of a substring match in the Next.js test, resolving the incomplete URL substring sanitization code-scanning alert.

## 1.0.0

### Major Changes

- af9a1e4: Initial 1.0 release. A unified batch API for AI providers spanning seven of them across three shapes: submit `generateText`-shaped requests with `batch()`, then poll, `wait()`, stream, or `collect()` normalized results correlated by `customId`. JSONL building/upload, inline submission, and a server-side webhook layer are handled for you.
