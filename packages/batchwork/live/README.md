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

| Provider  | Env var                                              | Default model                    |
| --------- | ---------------------------------------------------- | -------------------------------- |
| OpenAI    | `OPENAI_API_KEY`                                     | `gpt-4o-mini`                    |
| Anthropic | `ANTHROPIC_API_KEY`                                  | `claude-haiku-4-5`               |
| Google    | `GOOGLE_GENERATIVE_AI_API_KEY` (or `GEMINI_API_KEY`) | `gemini-2.5-flash`               |
| Groq      | `GROQ_API_KEY`                                       | `llama-3.1-8b-instant`           |
| Mistral   | `MISTRAL_API_KEY`                                    | `mistral-small-latest`           |
| Together  | `TOGETHER_API_KEY`                                   | `Qwen/Qwen2.5-7B-Instruct-Turbo` |
| xAI       | `XAI_API_KEY`                                        | `grok-3-mini`                    |

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

## Embeddings

`*-embeddings.live.test.ts` round-trip a 20-record **embedding** batch
(`batchEmbeddings()` → `wait()` → `collect()`) and assert every record returns a
non-empty vector. Only providers whose batch API accepts embeddings have one —
Anthropic, Groq, and xAI expose no embedding model, and Together's batch endpoint
rejects `/v1/embeddings`:

| Provider | Key (as above)                 | Default embedding model  | Override env var                         |
| -------- | ------------------------------ | ------------------------ | ---------------------------------------- |
| OpenAI   | `OPENAI_API_KEY`               | `text-embedding-3-small` | `BATCHWORK_LIVE_OPENAI_EMBEDDING_MODEL`  |
| Mistral  | `MISTRAL_API_KEY`              | `mistral-embed`          | `BATCHWORK_LIVE_MISTRAL_EMBEDDING_MODEL` |
| Google   | `GOOGLE_GENERATIVE_AI_API_KEY` | `gemini-embedding-001`   | `BATCHWORK_LIVE_GOOGLE_EMBEDDING_MODEL`  |

```sh
bun test --env-file=.env.local ./live/openai-embeddings.live.test.ts
```

## Images

`*-images.live.test.ts` round-trip a small **image-generation** batch
(`batchImages()` → `wait()` → `collect()`) and assert every record returns at
least one image (inline `data` or a hosted `url`). Generation is pricier and
slower, so fewer records are submitted. OpenAI, Google Gemini, and xAI image
models are batch-supported (Together's batch API is chat/audio only):

| Provider | Key (as above)                 | Default image model          | Override env var                    |
| -------- | ------------------------------ | ---------------------------- | ----------------------------------- |
| OpenAI   | `OPENAI_API_KEY`               | `gpt-image-1`                | `BATCHWORK_LIVE_OPENAI_IMAGE_MODEL` |
| Google   | `GOOGLE_GENERATIVE_AI_API_KEY` | `gemini-2.5-flash-image`     | `BATCHWORK_LIVE_GOOGLE_IMAGE_MODEL` |
| xAI      | `XAI_API_KEY`                  | `grok-imagine-image-quality` | `BATCHWORK_LIVE_XAI_IMAGE_MODEL`    |

xAI batch returns signed image URLs (`image.url`) that expire ~1h after
completion rather than inline base64.

```sh
bun test --env-file=.env.local ./live/openai-images.live.test.ts
```

## Store adapters

`postgres.live.test.ts` and `redis.live.test.ts` run the `BatchStore` contract
against a **real** Postgres and Upstash Redis, driven by the actual clients the
unit suite stubs out. Each is skipped unless its credentials are present:

| Backend  | Env var(s)                                           |
| -------- | ---------------------------------------------------- |
| Postgres | `DATABASE_URL`                                       |
| Redis    | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` |

The Postgres test creates its tables via `migratePostgres` and truncates between
cases; the Redis test namespaces every case under a unique key prefix and cleans
up afterward. Both are safe to point at a scratch database.

## Account gotchas

These tests exercise the library, but some failures are account-level, not bugs:

- **Groq** — the Batch API requires a paid plan. A free-tier key returns
  `403 not_available_for_plan` on file upload.
- **Together** — the model must be **serverless and batch-eligible**. Dedicated-only
  models fail with `Unable to access non-serverless model …`, and a few models are
  explicitly excluded from batch. Reasoning/code models may also return empty
  `text` (their output lands in a non-standard field).
