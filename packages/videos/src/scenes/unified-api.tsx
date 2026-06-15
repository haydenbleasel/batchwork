import { MarkerHighlight } from "../components/marker-highlight";
import { SplitScene } from "../components/split-scene";
import { COLORS } from "../theme";

const CODE = `import { batch } from "batchwork";

const job = await batch({
  model: "anthropic/claude-opus-4-8",
  requests: docs.map((doc) => ({
    customId: doc.id,
    prompt: \`Summarize: \${doc.text}\`,
  })),
});

console.log(job.id, job.provider, job.status);`;

export const UnifiedApi = () => (
  <SplitScene
    body="Submit thousands of LLM requests with a single call — at roughly half the cost. Batchwork handles JSONL, file uploads, polling, and result parsing for you."
    code={CODE}
    fileName="summarize.ts"
    title={
      <>
        One API for every{" "}
        <MarkerHighlight delay={24} markerColor={COLORS.syntax.func}>
          batch provider
        </MarkerHighlight>
        .
      </>
    }
  />
);
