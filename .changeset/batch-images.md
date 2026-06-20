---
"batchwork": minor
---

Add `batchImages()` for batch image-generation requests. It returns the same `BatchJob` handle as `batch()`, with each `prompt` producing one or more images correlated by `customId`, and exposes them on a new `BatchResult.images` field (inline base64 `data`/`mediaType`, or a hosted `url`). Supported on OpenAI (`/v1/images/generations`), Google Gemini image models (`:batchGenerateContent`), and xAI (`/v1/images/generations`); other providers throw `UnsupportedProviderError`. Generation only — image editing and Imagen models aren't batch-supported.
