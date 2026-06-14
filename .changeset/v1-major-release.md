---
"batchwork": major
---

Initial 1.0 release. A unified batch API for the Vercel AI SDK spanning seven providers across three shapes: submit `generateText`-shaped requests with `batch()`, then poll, `wait()`, stream, or `collect()` normalized results correlated by `customId`. JSONL building/upload, inline submission, and a server-side webhook layer are handled for you.
