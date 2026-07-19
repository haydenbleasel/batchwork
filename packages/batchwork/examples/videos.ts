/**
 * Live videos smoke test. Requires XAI_API_KEY. Video generation is billed
 * per clip — this submits a single 5s video.
 *
 *   XAI_API_KEY=xai-... bun packages/batchwork/examples/videos.ts
 *
 * In your own app, import from "batchwork" instead of "../src/index".
 */
import { writeFile } from "node:fs/promises";

import { batch } from "../src/index";

if (!process.env.XAI_API_KEY) {
  console.error("Set XAI_API_KEY to run this example.");
  process.exit(1);
}

console.log("Submitting a video batch to xAI…");

const job = await batch.videos({
  model: "xai/grok-imagine-video",
  requests: [
    {
      customId: "bicycle",
      duration: 5,
      prompt: "A red bicycle rolling downhill through autumn leaves.",
    },
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
  console.log(`${result.customId}: ${result.status}`);
  const video = result.videos?.[0];
  if (result.status === "succeeded" && video?.url) {
    // Signed URLs expire ~1h after completion — download promptly.
    const response = await fetch(video.url);
    const file = `${result.customId}.mp4`;
    await writeFile(file, Buffer.from(await response.arrayBuffer()));
    console.log(`  saved ${file} (${video.durationSeconds ?? "?"}s)`);
  } else if (result.status === "errored") {
    console.error(`  ${result.error?.message}`);
  }
}
