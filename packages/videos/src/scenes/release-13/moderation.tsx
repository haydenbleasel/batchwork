import { FeatureDemo } from "./feature-demo";

const CODE = `import { batch } from "batchwork";

const job = await batch.moderations({
  model: "openai/omni-moderation-latest",
  requests: posts.map((post) => ({
    customId: post.id,
    value: post.body,
  })),
});`;

export const Release13Moderation = () => (
  <FeatureDemo
    code={CODE}
    command="bun run moderate.ts"
    fileName="moderate.ts"
    output={["Submitted batch_51aa (openai) · 50,000 posts"]}
    result="✓ completed · 49,988 clean · 12 flagged · ~50% cheaper"
    spinnerLabel="screening 50,000 posts…"
    terminalPath="~/moderation-demo"
    title="Moderate everything"
  />
);
