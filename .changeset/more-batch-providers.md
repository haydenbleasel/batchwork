---
"batchwork": minor
---

Add batch adapters for **Groq**, **Together AI**, **Mistral**, **Google Gemini** (Developer API), and **xAI** — bringing supported providers to seven. Each reuses the same `batch()` API and capturing-fetch body builder, so you only swap the `model`. Groq/Together reuse the OpenAI file-upload shape; Mistral uses file jobs with the model set on the job; Gemini submits inline requests via `:batchGenerateContent`; xAI uses its OpenAI-compatible file upload with a proprietary status/results/cancel lifecycle. New batches are picked up automatically by the server poller. Bedrock and Vertex (which need object-storage staging + cloud IAM auth) remain out of scope for now.
