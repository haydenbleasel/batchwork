---
"batchwork": minor
---

Add `batch.videos()` — batch video generation for xAI (Grok Imagine). Prompts go through `/v1/videos/generations`, with per-line routing to `/v1/videos/edits` and `/v1/videos/extensions` via `providerOptions.xai` (`videoUrl`, `mode: "extend-video"`, `referenceImageUrls`), mirroring the AI SDK's `experimental_generateVideo`. Results land on `result.videos` as signed URLs that expire ~1h after completion. OpenAI's Videos API (Sora) is deliberately unsupported — it is deprecated and shuts down September 2026 — and Google's Veo models are not batch-compatible; both throw `UnsupportedProviderError`.
