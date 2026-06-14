import { CodeBlock } from "@/components/code-block";

const FILES = [
  {
    code: `import { batch } from "batchwork";
import { batches } from "@/lib/batches";
import { openai } from "@ai-sdk/openai";
import type { BatchRequest } from "batchwork";

// Can be a string (AI Gateway) or an object (AI SDK model)
const model = openai.chat("gpt-5.5");

// Author requests in the same shape you already use with the Vercel AI SDK
const requests: BatchRequest[] = [
  { customId: "a", prompt: "Summarize this…" },
  { customId: "b", prompt: "Translate this…" },
];

// Submit the batch and get a job handle
const job = await batch({ model, requests });

// Register the batch so the cron polls it
await batches.track(job);`,
    name: "app/actions.ts",
  },
  {
    code: `import { createBatchRoutes, createMemoryStore } from "batchwork/next";
import type { OnBatchComplete } from "batchwork/next";

// Or use a Vercel KV / Upstash / Postgres adapter
const store = createMemoryStore();

// Persist results to your database here.
const onComplete: OnBatchComplete = async (event, results) => {
  for await (const r of results) {
    await db.insert({ batchId: event.id, id: r.customId, text: r.text });
  }
};

// A route.ts may only export HTTP handlers, so define the routes here.
export const batches = createBatchRoutes({ store, onComplete });`,
    name: "lib/batches.ts",
  },
  {
    code: `import { batches } from "@/lib/batches";

// A cron hits GET; each finished batch streams into onComplete.
export const { GET } = batches;`,
    name: "app/api/batches/route.ts",
  },
];

// Server component: highlights each snippet with shiki at build time, then the
// client <Hero> renders it inside its animated wrapper.
export const CodeDemo = () => (
  <>
    {FILES.map((file, index) => (
      <div key={file.name}>
        {index > 0 && (
          <div
            aria-hidden
            className="mx-auto h-6 w-px bg-linear-to-b from-border to-transparent"
          />
        )}
        <div className="overflow-hidden rounded-2xl border border-border bg-card text-left shadow-sm">
          <div className="flex items-center gap-1.5 border-b border-dotted px-4 py-3">
            <span className="size-2.5 rounded-full bg-muted-foreground/25" />
            <span className="size-2.5 rounded-full bg-muted-foreground/25" />
            <span className="size-2.5 rounded-full bg-muted-foreground/25" />
            <span className="ml-2 font-mono text-muted-foreground text-xs">
              {file.name}
            </span>
          </div>
          <CodeBlock
            className="m-0! rounded-none! border-0! bg-transparent! shadow-none!"
            code={file.code}
            lang="ts"
          />
        </div>
      </div>
    ))}
  </>
);
