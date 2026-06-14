import { CodeBlock } from "@/components/code-block";

const FILES = [
  {
    code: `import { batch } from "batchwork";
import { track } from "./api/batches/route";

const job = await batch({
  model: "openai/gpt-5.5",
  requests: [
    { customId: "a", prompt: "Summarize this…" },
    { customId: "b", prompt: "Translate this…" },
  ],
});

await track(job); // hand off — no waiting`,
    name: "app/actions.ts",
  },
  {
    code: `import { createBatchRoutes, createMemoryStore } from "batchwork/next";

// A cron hits GET; each finished batch streams into your DB.
export const { GET, track } = createBatchRoutes({
  store: createMemoryStore(),
  onComplete: async (event, results) => {
    for await (const r of results) {
      await db.insert({ batchId: event.id, id: r.customId, text: r.text });
    }
  },
});`,
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
