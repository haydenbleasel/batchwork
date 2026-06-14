import { CodeWindow } from "@/components/code-window";

const CODE = `import { batch } from "batchwork";
import { openai } from "@ai-sdk/openai";

const job = await batch({
  model: openai.chat("gpt-5.5"),
  requests: docs.map((doc) => ({
    customId: doc.id,
    prompt: \`Summarize: \${doc.text}\`,
  })),
});

for await (const result of job.results()) {
  await saveSummary(result.customId, result.text);
}`;

// Server component: highlights the snippet with shiki at build time, then the
// client <Hero> renders it inside its animated wrapper.
export const CodeDemo = () => (
  <CodeWindow bare code={CODE} name="summarize.ts" />
);
