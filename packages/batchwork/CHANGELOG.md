# batchwork

## 1.0.1

### Patch Changes

- a8d4f19: Add configurable request count, request byte, upload byte, and capture concurrency limits for batch creation.
- 52d0ca5: Redact upstream provider response bodies from BatchworkError messages.
- e9a6ab8: Validate OpenAI-compatible batch and file ids before using them in provider API paths.
- 65b177d: Reject replayed webhook ids during webhook signature verification.
- 06b5d24: Keep Anthropic result downloads on the configured provider origin.
- 6e06892: Validate Google Gemini operation ids before using them in provider API paths.
- 4f91af8: Validate Mistral job and file ids before using them in provider API paths.
- 893d23b: Require explicit authorization or opt-in for Next.js cron polling routes.
- c2b6837: Prevent webhook delivery from following redirects after URL validation.
- 671df48: Validate default poller webhook destinations before tracking and delivery.
- 88471d8: Validate Anthropic batch ids before using them in provider API paths.
- 2153cae: Validate Together presigned upload locations before sending JSONL bytes.
- 9a5b126: Cap JSONL parser line sizes and wrap malformed JSONL in sanitized Batchwork errors.
- 8ed4a04: Restrict the CI workflow's `GITHUB_TOKEN` to `contents: read`, resolving the missing workflow permissions code-scanning alert.
- 723dc99: Validate xAI batch ids before using them in provider API paths.
- 67098ba: Validate the OpenAI request host by exact hostname comparison instead of a substring match in the Next.js test, resolving the incomplete URL substring sanitization code-scanning alert.

## 1.0.0

### Major Changes

- af9a1e4: Initial 1.0 release. A unified batch API for AI providers spanning seven of them across three shapes: submit `generateText`-shaped requests with `batch()`, then poll, `wait()`, stream, or `collect()` normalized results correlated by `customId`. JSONL building/upload, inline submission, and a server-side webhook layer are handled for you.
