import { FeatureDemo } from "./feature-demo";

const CODE = `import { batch } from "batchwork";
import { xai } from "@ai-sdk/xai";

const job = await batch.videos({
  model: xai.video("grok-imagine-video"),
  requests: scenes.map((scene) => ({
    customId: scene.id,
    prompt: scene.description,
    duration: 5,
  })),
});`;

export const Release13Video = () => (
  <FeatureDemo
    code={CODE}
    command="bun run videos.ts"
    fileName="videos.ts"
    output={["Submitted batch_c4e7 (xai) · 24 scenes"]}
    result="✓ completed · 24 videos · signed URLs · ~50% cheaper"
    spinnerLabel="rendering 24 clips…"
    terminalPath="~/video-demo"
    title="Generate video in batches"
  />
);
