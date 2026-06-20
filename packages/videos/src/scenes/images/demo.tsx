import { AbsoluteFill } from "remotion";

import { CodeTerminal } from "../../components/code-terminal";

const CODE = `import { batch } from "batchwork";
import { openai } from "@ai-sdk/openai";

const job = await batch.images({
  model: openai.image("gpt-image-2"),
  requests: prompts.map((p) => ({ customId: p.id, prompt: p.text })),
});

const results = await job.wait().then(() => job.collect());

for (const r of results) {
  for (const img of r.images ?? []) {
    await save(r.customId, img.data ?? img.url);
  }
}`;

const OUTPUT = ["Submitted batch_7f3d (openai) · 2,000 prompts"];

export const ImagesDemo = () => (
  <AbsoluteFill
    style={{
      alignItems: "center",
      justifyContent: "center",
      padding: "70px 120px",
    }}
  >
    <CodeTerminal
      code={CODE}
      command="bun run images.ts"
      delay={8}
      fileName="images.ts"
      fontSize={24}
      output={OUTPUT}
      result="✓ completed · 2,000 images · base64 + hosted · ~50% cheaper"
      spinnerLabel="generating 2,000 images…"
      terminalPath="~/images-demo"
      typeFrames={150}
      width={1340}
    />
  </AbsoluteFill>
);
