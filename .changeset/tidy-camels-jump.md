---
"batchwork": minor
---

Add `batch.images.edit()` — batch image editing for OpenAI and xAI via `/v1/images/edits`. Source images are passed as JSON asset references (`{ fileId }` from the OpenAI Files API or `{ imageUrl }`), with an optional `mask` on OpenAI; xAI takes URL references only and rejects masks/file ids before any network request. `batch.images.create()` is added as an explicit alias of `batch.images()`, which continues to work unchanged. Edited images land on `result.images` exactly like generation.
