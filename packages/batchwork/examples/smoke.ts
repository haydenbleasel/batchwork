/**
 * Live smoke test. Requires OPENAI_API_KEY or ANTHROPIC_API_KEY.
 *
 *   OPENAI_API_KEY=sk-... bun packages/batchwork/examples/smoke.ts
 *
 * In your own app, import from "batchwork" instead of "../src/index".
 */
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { batch } from "../src/index";

const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);

if (!(hasOpenAI || hasAnthropic)) {
  console.error("Set OPENAI_API_KEY or ANTHROPIC_API_KEY to run this example.");
  process.exit(1);
}

const model = hasOpenAI
  ? openai.chat("gpt-4o-mini")
  : anthropic("claude-haiku-4-5");

console.log(`Submitting a batch to ${hasOpenAI ? "OpenAI" : "Anthropic"}…`);

const job = await batch({
  model,
  defaults: { maxOutputTokens: 64 },
  requests: [
    {
      customId: "capital-fr",
      prompt: "What is the capital of France? Answer in one word.",
    },
    {
      customId: "capital-jp",
      prompt: "What is the capital of Japan? Answer in one word.",
    },
  ],
});

console.log(`Submitted ${job.id} (${job.provider}). Waiting for completion…`);

await job.wait({
  pollIntervalMs: 10_000,
  onPoll: (snapshot) =>
    console.log(
      `  status: ${snapshot.status} ${JSON.stringify(snapshot.requestCounts)}`
    ),
});

for await (const result of job.results()) {
  const detail = result.text ?? result.error?.message ?? "";
  console.log(`${result.customId}: ${result.status} — ${detail}`);
}
