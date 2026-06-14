# batchwork

The missing **batch API** for the [Vercel AI SDK](https://ai-sdk.dev) — submit thousands of LLM requests at ~50% cost with one unified call, across OpenAI and Anthropic.

```ts
import { batch } from "batchwork";
import { openai } from "@ai-sdk/openai";

const job = await batch({
  model: openai.chat("gpt-4o-mini"),
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

This is a [Turborepo](https://turborepo.dev) + pnpm workspace.

- [`packages/batchwork`](./packages/batchwork) — the library.
- `apps/web` — documentation site (planned).

```bash
pnpm install
pnpm build       # turbo run build
pnpm test        # turbo run test
pnpm typecheck   # turbo run typecheck
pnpm lint        # biome check
```

## License

MIT © Hayden Bleasel
