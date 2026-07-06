---
"batchwork": patch
---

Bump all dependencies. The AI SDK moves to the v4 provider spec: `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/groq`, `@ai-sdk/mistral`, `@ai-sdk/openai` and `@ai-sdk/xai` to `^4`, `@ai-sdk/togetherai` to `^3`, and the `ai` core to `^7` (required so the core recognises the new `LanguageModelV4`/`EmbeddingModelV4`/`ImageModelV4` specification). Peer ranges are unchanged, so existing installs keep working. All remaining dev and tooling dependencies (TypeScript, `@types/node`, `pg`/`@electric-sql/pglite`, oxlint/ultracite, Turborepo, Remotion) are also brought up to date.
