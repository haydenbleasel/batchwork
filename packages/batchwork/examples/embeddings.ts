/**
 * Live embeddings smoke test. Requires OPENAI_API_KEY.
 *
 *   OPENAI_API_KEY=sk-... bun packages/batchwork/examples/embeddings.ts
 *
 * In your own app, import from "batchwork" instead of "../src/index".
 */
import { openai } from "@ai-sdk/openai";

import { batch } from "../src/index";

if (!process.env.OPENAI_API_KEY) {
  console.error("Set OPENAI_API_KEY to run this example.");
  process.exit(1);
}

console.log("Submitting an embeddings batch to OpenAI…");

const job = await batch.embeddings({
  model: openai.embeddingModel("text-embedding-3-small"),
  requests: [
    { customId: "fox", value: "The quick brown fox jumps over the lazy dog." },
    { customId: "weather", value: "It is sunny with a chance of rain today." },
  ],
});

console.log(`Submitted ${job.id} (${job.provider}). Waiting for completion…`);

await job.wait({
  onPoll: (snapshot) =>
    console.log(
      `  status: ${snapshot.status} ${JSON.stringify(snapshot.requestCounts)}`
    ),
  pollIntervalMs: 10_000,
});

for await (const result of job.results()) {
  const detail =
    result.embedding === undefined
      ? (result.error?.message ?? "")
      : `${result.embedding.length} dims`;
  console.log(`${result.customId}: ${result.status} — ${detail}`);
}
