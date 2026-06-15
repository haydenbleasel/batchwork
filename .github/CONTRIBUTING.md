# Contributing to Batchwork

Thanks for your interest in contributing! `batchwork` is a unified batch API for AI providers — low-cost LLM batch processing across providers. Bug reports, new providers, docs improvements, and discussion are all welcome.

## Source Code

The repository is hosted on GitHub at [haydenbleasel/batchwork](https://github.com/haydenbleasel/batchwork).

## Project Scope

`batchwork` aims for a small API surface that behaves the same way across every provider. Before opening a PR, it helps to understand the design intent:

- **AI SDK native.** You author requests in the same `generateText` shape you already use and pass the same AI SDK models. The unified `BatchResult` is the only result type, regardless of provider.
- **Common subset, not lowest common denominator.** The core covers the batch lifecycle — submit, poll, results, cancel, rehydrate-by-id. Provider-specific quirks are normalized away rather than surfaced.
- **Three batch "shapes," not N implementations.** Every provider is built on one of three shapes (JSONL file upload, inline array, inline `:batchGenerateContent`). New providers should slot into an existing shape wherever possible instead of adding bespoke plumbing.
- **Tiny footprint.** The library depends only on `ai`; the `@ai-sdk/*` provider packages are optional peer dependencies you opt into.

If you're proposing a feature that doesn't fit the common subset, the answer is usually "use `providerOptions`" or "rehydrate by id and call the provider directly" rather than "add it to the core."

## Monorepo Structure

The repo is a [Turborepo](https://turbo.build) + [Bun](https://bun.sh) monorepo:

- `packages/batchwork` — the library itself
  - `src/index.ts` — the public `batch()` API, `BatchJob` handle, and shared types (`BatchResult`, status unions, etc.)
  - `src/server/` — the managed poller and unified, signed webhook layer (`batchwork/server`)
  - `src/next/` — Next.js App Router callback route handlers (`batchwork/next`)
  - provider implementations, grouped by the three batch shapes (JSONL upload, inline array, inline Gemini)
  - `test/` — Bun tests that mock at the `fetch` boundary
  - `live/` — opt-in live tests that hit real provider batch endpoints (need credentials)
- `apps/web` — the Next.js docs/marketing site

## Getting Started

1. Fork the repository on GitHub
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/batchwork.git`
3. Install dependencies: `bun install`
4. Create a branch: `git checkout -b your-branch-name`
5. Make your changes
6. Run tests and type checks (see below)
7. Add a changeset if your change affects the published package
8. Commit, push, and open a Pull Request

## Running Things Locally

From the repo root:

- `bun run build` — build all packages with Turbo
- `bun run test` — run the full test suite
- `bun run typecheck` — type-check with tsgo
- `bun run check` / `bun run fix` — lint and auto-fix with [Ultracite](https://www.ultracite.ai/) (oxlint + oxfmt)

From `packages/batchwork`:

- `bun run dev` — rebuild on change (watch mode)
- `bun test` — run only the library tests
- `bun run test:coverage` — tests with coverage
- `bun run test:live` — run the live tests against real providers (needs `.env.local`; see `.env.example`)

For the docs site:

```bash
cd apps/web
bun dev
```

## Providers

Each provider plugs into one of three batch "shapes":

| Shape               | Providers                               |
| ------------------- | --------------------------------------- |
| JSONL file upload   | OpenAI, Groq, Together AI, Mistral, xAI |
| Inline `requests[]` | Anthropic                               |
| Inline Gemini batch | Google Gemini                           |

A few conventions worth keeping:

- **Build request bodies through the AI SDK, not by hand.** `batchwork` runs each request through the AI SDK with a capturing `fetch` that records the serialized body and aborts before any network call — so messages, tools, multimodal content, and `providerOptions` come out exactly as `generateText` would send them. New providers should reuse this, not reimplement body building.
- **Reuse an existing shape where you can.** OpenAI-compatible providers (Groq, xAI) lean on the JSONL upload path with provider-specific defaults. Prefer that over a hand-rolled implementation.
- **Results are normalized.** Every provider maps into the unified `BatchResult`, correlated by `customId`, with unified status, text, usage, and error types. Callers should never need provider-specific result handling.
- **Tests live alongside.** Each provider ships with mocked tests at parity with the existing ones, plus an entry in the `live/` suite if it can be exercised end to end.

If you're proposing a brand-new provider, please open a discussion first — adding one is a long-term maintenance commitment, and we want to make sure it fits one of the three shapes before the code lands.

## Tests

- We use `bun test`. Mocked tests live in `packages/batchwork/test/`; live tests live in `packages/batchwork/live/`.
- Mock at the `fetch` boundary so tests don't hit real provider endpoints.
- Live tests are opt-in and require real credentials via `.env.local` (copy `.env.example`). They are not run in CI.
- New behavior in the core API needs coverage in the relevant test file and in every provider test that's affected.

## Changesets

We use [Changesets](https://github.com/changesets/changesets) to manage versions and the changelog.

1. Run `bun changeset` from the repo root
2. Pick `batchwork` and the appropriate bump:
   - `patch` — bug fixes, internal improvements visible to users
   - `minor` — new providers, new methods, additive options
   - `major` — anything that changes existing call signatures or behavior
3. Write a clear, user-facing description (this becomes the changelog entry)
4. Commit the generated `.changeset/*.md` file alongside your changes

**Add a changeset for:** bug fixes, new features, new providers, behavior changes, performance improvements that users will notice.

**Skip the changeset for:** internal refactors, test-only changes, docs site changes, CI/build tweaks, README or contributing-guide updates.

## Pull Request Guidelines

- Keep PRs focused. One feature or fix per PR.
- Include a clear description of what changes and why. Linking to a discussion or issue is helpful.
- Update tests and docs alongside the code change.
- Run `bun run fix` before committing so formatting matches.
- Make sure `bun run test`, `bun run typecheck`, and `bun run build` all pass.
- If your PR touches the public API, update the docs in `apps/web` too.

## Reporting Issues

### Bugs

Use the [issue tracker](https://github.com/haydenbleasel/batchwork/issues). A good bug report includes:

- The provider and entrypoint (`batchwork`, `batchwork/server`, `batchwork/next`) you're using
- A minimal reproduction (the smallest `batch({ ... })` snippet that triggers it)
- What you expected vs. what happened
- Library version and runtime (Node, Bun, Vercel serverless, etc.)

### Feature Requests and Discussions

Open an [issue](https://github.com/haydenbleasel/batchwork/issues) for proposals — especially anything that touches the public API or proposes a new provider. It's much faster to align on shape before code is written.

## Code of Conduct

Please be respectful in issues, discussions, and PR review. By participating you agree to keep this a welcoming project.

Thanks for contributing!
