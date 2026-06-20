/**
 * Live image-generation smoke test. Requires OPENAI_API_KEY.
 *
 *   OPENAI_API_KEY=sk-... bun packages/batchwork/examples/images.ts
 *
 * In your own app, import from "batchwork" instead of "../src/index".
 */
import { openai } from "@ai-sdk/openai";

import { batch } from "../src/index";

if (!process.env.OPENAI_API_KEY) {
  console.error("Set OPENAI_API_KEY to run this example.");
  process.exit(1);
}

console.log("Submitting an image batch to OpenAI…");

const job = await batch.images({
  model: openai.image("gpt-image-2"),
  requests: [
    { customId: "bike", prompt: "A red bicycle leaning against a brick wall." },
    { customId: "cat", prompt: "A watercolor painting of a sleeping cat." },
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
    result.images === undefined
      ? (result.error?.message ?? "")
      : `${result.images.length} image(s), ${result.images[0]?.mediaType}`;
  console.log(`${result.customId}: ${result.status} — ${detail}`);
}
