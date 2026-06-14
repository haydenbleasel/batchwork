# Live provider tests

These tests hit **real** provider batch APIs. For each provider they submit a
20-record batch, wait for completion, and assert the full round-trip
(`batch()` → `wait()` → `collect()`) works — they exist to catch runtime issues
that the mocked suite under `../test` can't.

They cost money and can take minutes to run, so they are **excluded from the
default `bun test`** (which is scoped to `./test`). Run them explicitly:

```sh
# from packages/batchwork
bun run test:live              # every provider whose key is set
bun test ./live/xai.live.test.ts   # just one provider
```

A provider's test is **skipped** unless its API key is present, so you only run
the ones you have credentials for.

## Credentials

Set the relevant key(s) in your environment (e.g. a local `.env`, which is
git-ignored):

| Provider  | Env var                                              | Default model                                 |
| --------- | ---------------------------------------------------- | --------------------------------------------- |
| OpenAI    | `OPENAI_API_KEY`                                     | `gpt-4o-mini`                                 |
| Anthropic | `ANTHROPIC_API_KEY`                                  | `claude-haiku-4-5`                            |
| Google    | `GOOGLE_GENERATIVE_AI_API_KEY` (or `GEMINI_API_KEY`) | `gemini-2.5-flash`                            |
| Groq      | `GROQ_API_KEY`                                       | `llama-3.1-8b-instant`                        |
| Mistral   | `MISTRAL_API_KEY`                                    | `mistral-small-latest`                        |
| Together  | `TOGETHER_API_KEY`                                   | `meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo` |
| xAI       | `XAI_API_KEY`                                        | `grok-3-mini`                                 |

A `.env.local` like this is enough (copy `.env.example`):

```sh
OPENAI_API_KEY=sk-...
XAI_API_KEY=xai-...
```

> **Why `--env-file`?** `bun test` runs with `NODE_ENV=test`, and Bun (following
> the Next.js convention) does **not** auto-load `.env.local` in the test
> environment. The `test:live` script therefore passes `--env-file=.env.local`
> explicitly. Exported shell variables work too and take precedence.

## Tuning

All optional, via environment variables:

| Variable                          | Purpose                                                    | Default         |
| --------------------------------- | ---------------------------------------------------------- | --------------- |
| `BATCHWORK_LIVE_TIMEOUT_MS`       | How long to wait for a batch before giving up              | `1800000` (30m) |
| `BATCHWORK_LIVE_POLL_MS`          | Delay between status polls                                 | `10000` (10s)   |
| `BATCHWORK_LIVE_<PROVIDER>_MODEL` | Override the model id (e.g. `BATCHWORK_LIVE_OPENAI_MODEL`) | per table above |
