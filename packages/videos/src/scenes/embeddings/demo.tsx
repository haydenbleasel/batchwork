import { AbsoluteFill } from "remotion";

import { CodeTerminal } from "../../components/code-terminal";

const CODE = `import { batchEmbeddings } from "batchwork";
import { openai } from "@ai-sdk/openai";

const job = await batchEmbeddings({
  model: openai.textEmbeddingModel("text-embedding-3-small"),
  requests: docs.map((doc) => ({ customId: doc.id, value: doc.text })),
});

const results = await job.wait().then(() => job.collect());

for (const r of results) {
  await index.upsert(r.customId, r.embedding);
}`;

const OUTPUT = ["Submitted batch_8a1c (openai) · 12,480 texts"];

export const EmbeddingsDemo = () => (
  <AbsoluteFill
    style={{
      alignItems: "center",
      justifyContent: "center",
      padding: "70px 120px",
    }}
  >
    <CodeTerminal
      code={CODE}
      command="bun run embed.ts"
      delay={8}
      fileName="embed.ts"
      fontSize={24}
      output={OUTPUT}
      result="✓ completed · 1536-dim vectors · 16 hours elapsed · ~50% cheaper"
      spinnerLabel="embedding 12,480 texts…"
      terminalPath="~/embeddings-demo"
      typeFrames={150}
      width={1340}
    />
  </AbsoluteFill>
);
