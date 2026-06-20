---
"batchwork": minor
---

Add a unified `batch.*` namespace: `batch.text()`, `batch.embeddings()`, and `batch.images()`. `batch()` remains a callable shorthand for `batch.text()`. The standalone `batchEmbeddings()` and `batchImages()` exports are now deprecated aliases for `batch.embeddings()` and `batch.images()` respectively, and will be removed in a future major.
