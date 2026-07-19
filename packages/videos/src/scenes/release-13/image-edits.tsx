import { FeatureDemo } from "./feature-demo";

const CODE = `import { batch } from "batchwork";
import { openai } from "@ai-sdk/openai";

const job = await batch.images.edit({
  model: openai.image("gpt-image-2"),
  requests: photos.map((photo) => ({
    customId: photo.id,
    prompt: "Remove the background.",
    images: [{ imageUrl: photo.url }],
  })),
});`;

export const Release13ImageEdits = () => (
  <FeatureDemo
    code={CODE}
    command="bun run edit.ts"
    fileName="edit.ts"
    output={["Submitted batch_e803 (openai) · 3,500 photos"]}
    result="✓ completed · 3,500 edited images · base64 · ~50% cheaper"
    spinnerLabel="editing 3,500 images…"
    terminalPath="~/edit-demo"
    title="Edit images in bulk"
  />
);
