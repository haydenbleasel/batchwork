/**
 * Live moderations smoke test. Requires OPENAI_API_KEY.
 *
 *   OPENAI_API_KEY=sk-... bun packages/batchwork/examples/moderations.ts
 *
 * In your own app, import from "batchwork" instead of "../src/index".
 */
import { batch } from "../src/index";

if (!process.env.OPENAI_API_KEY) {
  console.error("Set OPENAI_API_KEY to run this example.");
  process.exit(1);
}

console.log("Submitting a moderation batch to OpenAI…");

const job = await batch.moderations({
  model: "openai/omni-moderation-latest",
  requests: [
    { customId: "benign", value: "What a lovely day for a picnic." },
    { customId: "spicy", value: "I want to key my neighbor's car." },
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
  const verdict = result.moderation;
  if (result.status === "succeeded" && verdict) {
    const flaggedCategories = Object.entries(verdict.categories)
      .filter(([, flagged]) => flagged)
      .map(([category]) => category);
    console.log(
      `${result.customId}: flagged=${verdict.flagged}${
        flaggedCategories.length > 0 ? ` (${flaggedCategories.join(", ")})` : ""
      }`
    );
  } else {
    console.error(`${result.customId}: ${result.error?.message}`);
  }
}
