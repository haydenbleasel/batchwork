---
"batchwork": minor
---

Add the server layer (`batchwork/server`): a managed poller and one unified, signed webhook for batch completion across providers. Includes `createBatchPoller` (`track`/`tick`), an OpenAI native-webhook handler that skips polling, a pluggable `BatchStore` with `createMemoryStore`, and Standard Webhooks-compatible `signWebhook`/`verifyBatchWebhook`. `getBatch`/`getBatchResults`/`cancelBatch` now accept `provider` directly (not just `model`) to rehydrate from a webhook event.
