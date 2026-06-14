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
// seven providers and Batchwork handles each batch format.
const job = await batch({
  model: anthropic("claude-opus-4-8"),
  requests: docs.map((doc) => ({
    customId: doc.id,
    prompt: \`Summarize: \${doc.text}\`,
  })),
});

// One normalized result type, keyed by customId.
const summaries = await job.collect();`,
    description:
      "You already write generateText calls — keep writing them. Batchwork runs your requests in bulk across all seven providers, handling each batch format, the upload, the polling, and parsing.",
    eyebrow: "Unified interface",
    fileName: "summarize.ts",
    href: "/usage",
    title: "Same code, half the cost",
  },
  {
    code: `import { createBatchPool } from "batchwork/pool";
import { xai } from "@ai-sdk/xai";

const pool = createBatchPool({
  model: xai("grok-build-0.1"),
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
      "Requests don't always arrive at once. When they trickle in one at a time, Batchwork pools them and sends a batch automatically once it's big enough or has waited long enough.",
    eyebrow: "Pooling",
    fileName: "lib/pool.ts",
    href: "/pool",
    title: "Batch requests as they arrive",
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

// Next.js Route Handler hits GET; finished batches stream into onComplete.
export const { GET, POST } = routes;`,
    description:
      "Drop two route handlers into your app and point a Cron job at them. Each tick, Batchwork checks your in-flight batches and saves the results straight to your database when they finish.",
    eyebrow: "Next.js",
    fileName: "app/api/batches/route.ts",
    href: "/next",
    title: "Results land in your database",
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
      "Prefer webhooks? Batchwork watches your open batches and fires one signed event the moment each finishes — native provider webhooks where they exist, a managed poller everywhere else.",
    eyebrow: "Server",
    fileName: "lib/poller.ts",
    href: "/server",
    title: "Get a webhook when batches finish",
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
            <div className="max-w-xl mx-auto">
              <p className="font-mono text-muted-foreground text-xs uppercase tracking-wide">
                {section.eyebrow}
              </p>
              <h2 className="mt-4 text-balance font-medium text-3xl text-foreground tracking-tight sm:text-4xl">
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
            </div>
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
