---
"batchwork": minor
---

Add `batchEmbeddings()` for batch embedding requests. It returns the same `BatchJob` handle as `batch()`, with one vector per request correlated by `customId`, and exposes the vector on a new `BatchResult.embedding` field. Supported on OpenAI, Mistral, and Google Gemini (Anthropic, Groq, and xAI have no embedding model, and Together's batch API doesn't accept the embeddings endpoint).
