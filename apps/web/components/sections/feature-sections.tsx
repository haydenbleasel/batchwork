import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { CodeWindow } from "@/components/code-window";
import { FadeIn } from "@/components/fade-in";
import { cn } from "@/lib/utils";

interface Section {
  code: string;
  description: string;
  eyebrow: string;
  fileName: string;
  href: string;
  title: string;
}

const SECTIONS: Section[] = [
  {
    code: `import { batch } from "batchwork";
import { anthropic } from "@ai-sdk/anthropic";

// Same shape as generateText — swap the model for any of
// seven providers and batchwork handles each batch format.
const job = await batch({
  model: anthropic("claude-haiku-4-5"),
  requests: docs.map((doc) => ({
    customId: doc.id,
    prompt: \`Summarize: \${doc.text}\`,
  })),
});

// One normalized result type, keyed by customId.
const summaries = await job.collect();`,
    description:
      "Author requests in the same generateText shape you already use, then run them across OpenAI, Anthropic, Google, Groq, Mistral, Together AI, and xAI. batchwork builds each provider's batch format, uploads, polls, and parses the results into one type keyed by customId — at roughly half the synchronous price.",
    eyebrow: "Unified interface",
    fileName: "summarize.ts",
    href: "/usage",
    title: "One batch() call, seven providers",
  },
  {
    code: `import { createBatchPool } from "batchwork/pool";
import { openai } from "@ai-sdk/openai";

const pool = createBatchPool({
  model: openai.chat("gpt-4o-mini"),
  maxSize: 50, // flush at 50 requests…
  maxDuration: 3600, // …or an hour after the first
  onFlush: async (job) => {
    for (const r of await job.collect()) {
      await saveSummary(r.customId, r.text);
    }
  },
});

// Push items in as they arrive.
const id = await pool.add({ prompt: "Summarize this…" });`,
    description:
      "batch() needs every request up front. When prompts trickle in one at a time, batchwork/pool accumulates them and submits a batch when a size or age threshold is hit — whichever comes first.",
    eyebrow: "Pooling",
    fileName: "lib/pool.ts",
    href: "/pool",
    title: "Buffer requests, flush as one batch",
  },
  {
    code: `import { createBatchRoutes, createMemoryStore } from "batchwork/next";

const routes = createBatchRoutes({
  store: createMemoryStore(), // → KV/Postgres in production
  onComplete: async (event, results) => {
    for await (const r of results) {
      await db.results.upsert({ id: r.customId, text: r.text });
    }
  },
});

// A Vercel Cron hits GET; finished batches stream into onComplete.
export const { GET, POST } = routes;`,
    description:
      "createBatchRoutes gives you App Router handlers that poll in-flight batches and call onComplete in-process when each finishes — persist results straight to your database, no self-webhook round-trip.",
    eyebrow: "Next.js",
    fileName: "app/api/batches/route.ts",
    href: "/next",
    title: "Poll batches on a cron tick",
  },
  {
    code: `import { batch } from "batchwork";
import { createBatchPoller, createMemoryStore } from "batchwork/server";

const poller = createBatchPoller({ store: createMemoryStore() });

const job = await batch({ model, requests });
await poller.track(job, {
  webhookUrl: "https://acme.com/webhooks/batch",
  secret: process.env.BATCH_WEBHOOK_SECRET,
});

// Run on a schedule; POSTs a signed event for each finished batch.
export const GET = async () => Response.json(await poller.tick());`,
    description:
      "Prefer webhooks? batchwork/server watches open batches and delivers one signed event when each finishes — native provider webhooks where they exist, a managed poller everywhere else.",
    eyebrow: "Server",
    fileName: "lib/poller.ts",
    href: "/server",
    title: "One signed webhook on completion",
  },
];

export const FeatureSections = () => (
  <section className="mx-auto flex max-w-(--fd-layout-width) flex-col gap-20 px-4 py-20 sm:gap-28 md:gap-36 sm:py-28">
    {SECTIONS.map((section, index) => {
      const reversed = index % 2 === 1;

      return (
        <div
          className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16"
          key={section.title}
        >
          <FadeIn className={reversed ? "lg:order-2" : undefined}>
            <p className="font-mono text-muted-foreground text-xs uppercase tracking-wide">
              {section.eyebrow}
            </p>
            <h2 className="mt-4 max-w-[18ch] text-balance font-medium text-3xl text-foreground tracking-tight sm:text-4xl">
              {section.title}
            </h2>
            <p className="mt-4 max-w-[52ch] text-pretty text-base text-muted-foreground leading-relaxed sm:text-lg">
              {section.description}
            </p>
            <Link
              className="group mt-6 inline-flex items-center gap-1.5 font-medium text-foreground text-sm"
              href={section.href}
            >
              Learn more
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </FadeIn>

          <FadeIn
            className={cn("min-w-0", reversed && "lg:order-1")}
            delay={0.08}
          >
            <CodeWindow code={section.code} name={section.fileName} />
          </FadeIn>
        </div>
      );
    })}
  </section>
);
