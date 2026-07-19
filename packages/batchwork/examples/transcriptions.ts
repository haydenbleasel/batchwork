/**
 * Live transcriptions smoke test. Requires GROQ_API_KEY.
 *
 *   GROQ_API_KEY=gsk-... bun packages/batchwork/examples/transcriptions.ts
 *
 * In your own app, import from "batchwork" instead of "../src/index".
 */
import { groq } from "@ai-sdk/groq";

import { batch } from "../src/index";

if (!process.env.GROQ_API_KEY) {
  console.error("Set GROQ_API_KEY to run this example.");
  process.exit(1);
}

// A short public-domain sample; batch audio takes hosted URLs, not uploads.
const AUDIO_URL =
  "https://github.com/voxserv/audio_quality_testing_samples/raw/refs/heads/master/testaudio/8000/test01_20s.wav";

console.log("Submitting a transcription batch to Groq…");

const job = await batch.transcriptions({
  model: groq.transcription("whisper-large-v3"),
  requests: [
    {
      audioUrl: AUDIO_URL,
      customId: "sample",
      language: "en",
      timestampGranularities: ["segment"],
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
  if (result.status === "succeeded") {
    console.log(result.text);
    for (const segment of result.segments ?? []) {
      console.log(
        `  [${segment.startSecond}s–${segment.endSecond}s] ${segment.text}`
      );
    }
  } else {
    console.error(result.error?.message);
  }
}
