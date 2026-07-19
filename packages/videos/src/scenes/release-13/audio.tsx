import { FeatureDemo } from "./feature-demo";

const CODE = `import { batch } from "batchwork";
import { groq } from "@ai-sdk/groq";

const job = await batch.transcriptions({
  model: groq.transcription("whisper-large-v3"),
  requests: calls.map((call) => ({
    customId: call.id,
    audioUrl: call.recordingUrl,
  })),
});`;

export const Release13Audio = () => (
  <FeatureDemo
    code={CODE}
    command="bun run transcribe.ts"
    fileName="transcribe.ts"
    output={["Submitted batch_9d2f (groq) · 1,200 recordings"]}
    result="✓ completed · 1,200 transcripts · text + segments · ~50% cheaper"
    spinnerLabel="transcribing 1,200 recordings…"
    terminalPath="~/audio-demo"
    title="Transcribe audio at scale"
  />
);
