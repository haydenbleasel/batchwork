---
"batchwork": minor
---

Add the Next.js layer (`batchwork/next`): `createBatchRoutes` returns App Router route handlers that poll your in-flight batches on a cron tick and invoke an `onComplete(event, results)` callback directly when each finishes — persist results to your DB without round-tripping an HTTP webhook back to your own app. Bundles an optional OpenAI native-webhook `POST` handler (via `openaiSigningSecret`) and optional cron-secret auth (via `cronSecret`), and re-exports `createMemoryStore`. The `createBatchPoller` completion step is now pluggable via an `onComplete` sink (defaulting to signed-webhook delivery) with optional per-batch `onError` isolation; `TrackedBatch.webhookUrl` is now optional. Delivery is at-least-once — make `onComplete` idempotent.
