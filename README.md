# Batchwork

The missing **batch API** for the [Vercel AI SDK](https://ai-sdk.dev) — submit thousands of LLM requests at ~50% cost with one unified call, across OpenAI, Anthropic, Google Gemini, Groq, Mistral, Together AI, and xAI.

```ts
import { batch } from "batchwork";
import { openai } from "@ai-sdk/openai";

const job = await batch({
  model: openai.chat("gpt-5.5"),
  requests: [
    { customId: "a", prompt: "Summarize: …" },
    { customId: "b", messages: [{ role: "user", content: "Translate: …" }] },
  ],
});

for (const r of await job.wait().then(() => job.collect())) {
  console.log(r.customId, r.status, r.text);
}
```

See [`packages/batchwork`](./packages/batchwork) for full documentation.

## Monorepo

This is a [Turborepo](https://turborepo.dev) + [Bun](https://bun.sh) workspace.

- [`packages/batchwork`](./packages/batchwork) — the library.
- `apps/web` — documentation site (planned).

```bash
bun install
bun run build       # turbo run build
bun run test        # turbo run test
bun run typecheck   # turbo run typecheck
bun run lint        # biome check
```

## License

MIT © Hayden Bleasel
