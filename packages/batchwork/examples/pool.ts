/**
 * Live on-demand pooling example. Requires OPENAI_API_KEY.
 *
 *   OPENAI_API_KEY=sk-... bun packages/batchwork/examples/pool.ts
 *
 * In your own app, import from "batchwork/pool" instead of "../src/pool".
 *
 * Pushes individual requests into a pool that submits a batch once it reaches
 * `maxSize` (here, 3) — the same trigger a frontend would hit by enqueuing one
 * item per user action. The age trigger (`maxDuration`) is set high so this
 * short script flushes on size; in a long-running process the pool's timer
 * would fire the age flush, and in serverless you'd drive it from a cron via
 * `pool.flushDue()`.
 */
import { openai } from "@ai-sdk/openai";

import { createBatchPool } from "../src/pool";

if (!process.env.OPENAI_API_KEY) {
  console.error("Set OPENAI_API_KEY to run this example.");
  process.exit(1);
}

const pool = createBatchPool({
  defaults: { maxOutputTokens: 64 },
  maxDuration: 3600,
  maxSize: 3,
  model: openai.chat("gpt-4o-mini"),
  onFlush: async (job, requests) => {
    console.log(
      `Flushed ${requests.length} request(s) as ${job.id}. Waiting for completion…`
    );
    await job.wait({ pollIntervalMs: 10_000 });
    for await (const result of job.results()) {
      const detail = result.text ?? result.error?.message ?? "";
      console.log(`  ${result.customId}: ${result.status} — ${detail}`);
    }
  },
});

const prompts = [
  ["capital-fr", "What is the capital of France? Answer in one word."],
  ["capital-jp", "What is the capital of Japan? Answer in one word."],
  ["capital-eg", "What is the capital of Egypt? Answer in one word."],
];

for (const [customId, prompt] of prompts) {
  // oxlint-disable-next-line no-await-in-loop -- enqueue one at a time, like a frontend would.
  const id = await pool.add({ customId, prompt });
  console.log(`Enqueued ${id}`);
}

console.log(`Pool size after enqueueing: ${await pool.size()}`);

// Submit anything still buffered (here, nothing — the 3rd add hit maxSize).
await pool.close();
