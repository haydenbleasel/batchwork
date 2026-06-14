---
"batchwork": minor
---

Initial release. A unified batch API for the Vercel AI SDK across OpenAI and Anthropic: submit `generateText`-shaped requests with `batch()`, then poll, `wait()`, stream, or `collect()` normalized results correlated by `customId`. JSONL building/upload (OpenAI) and inline submission (Anthropic) are handled for you.
