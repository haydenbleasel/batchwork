import { ArrowRight, FileCheck, Route, Workflow } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { CodeWindow } from "@/components/code-window";
import { FadeIn } from "@/components/fade-in";
import { cn } from "@/lib/utils";

interface Section {
  code: string;
  description: string;
  fileName: string;
  href: string;
  title: string;
}

interface Feature {
  description: string;
  href: string;
  title: string;
}

interface Benefit {
  description: string;
  Icon: LucideIcon;
  title: string;
}

const BENEFITS: Benefit[] = [
  {
    Icon: Route,
    description:
      "Keep provider-native batch endpoints and pricing underneath, with one application contract above them.",
    title: "Native APIs stay native",
  },
  {
    Icon: Workflow,
    description:
      "Track submission, status, cancellation, rehydration, and delivery through the same lifecycle everywhere.",
    title: "One job lifecycle",
  },
  {
    Icon: FileCheck,
    description:
      "Handle unordered output, failures, usage, and raw responses through a normalized result type keyed by customId.",
    title: "Consistent results",
  },
];

const STORY_SECTIONS: Section[] = [
  {
    code: `import { batch } from "batchwork";

const job = await batch({
  model: "anthropic/claude-opus-4-8",
  requests: docs.map((doc) => ({
    customId: doc.id,
    prompt: \`Summarize: \${doc.text}\`,
    maxOutputTokens: 512,
  })),
});

console.log(job.id, job.provider, job.status);`,
    description:
      "Keep the request shape you already use with the AI SDK. Batchwork serializes the right provider body, submits the batch, tracks the lifecycle, and gives you one job handle back.",
    fileName: "summarize.ts",
    href: "/usage",
    title: "One call replaces the provider plumbing",
  },
  {
    code: `await job.wait();

for await (const result of job.results()) {
  if (result.status !== "succeeded") {
    await retrySummary(result.customId, result.error);
    continue;
  }

  await saveSummary(result.customId, {
    text: result.text,
    usage: result.usage,
  });
}`,
    description:
      "When the provider finishes, read normalized results from any script, worker, queue, or backend. Every result is correlated by customId, with one status and usage shape across providers.",
    fileName: "process-results.ts",
    href: "/results",
    title: "Await and process results anywhere",
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

// Run on a schedule. OpenAI can use native webhooks;
// every other provider is polled behind the same API.
export const GET = async () => Response.json(await poller.tick());`,
    description:
      "For production, register each job once and let Batchwork deliver a signed event when it finishes. Native OpenAI webhooks and managed polling collapse into the same delivery path.",
    fileName: "lib/poller.ts",
    href: "/server",
    title: "No long-running wait loops in production",
  },
];

const FEATURES: Feature[] = [
  {
    description:
      "Buffer individual requests and submit a batch automatically when enough work has accumulated or the oldest item has waited long enough.",
    href: "/pool",
    title: "Batch trickle-in workloads",
  },
  {
    description:
      "Export App Router GET and POST handlers for Cron ticks and native webhooks, while onComplete runs in-process so results can go straight to your database.",
    href: "/next",
    title: "Route handlers without the boilerplate",
  },
  {
    description:
      "Persist the provider batch id and reconnect later from another process. No original request payloads required.",
    href: "/job",
    title: "Resume work by batch id",
  },
  {
    description:
      "OpenAI, Anthropic, Gemini, Groq, Mistral, Together AI, and xAI all return one normalized BatchResult shape.",
    href: "/providers",
    title: "Seven providers, one result model",
  },
];

export const FeatureSections = () => (
  <section className="mx-auto flex max-w-(--fd-layout-width) flex-col gap-20 px-4 py-20 sm:gap-28 sm:py-28 md:gap-32">
    <FadeIn>
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-balance font-medium text-3xl text-foreground tracking-tight sm:text-5xl">
          One workflow for every batch API.
        </h2>
        <p className="mt-5 text-pretty text-base text-muted-foreground leading-relaxed sm:text-lg">
          Keep each provider's native batch endpoint underneath, while your app
          gets a stable contract for jobs, status, and results. Change models
          without rebuilding the pipeline around them.
        </p>
      </div>

      <div className="mx-auto mt-12 grid max-w-5xl gap-4 md:grid-cols-3">
        {BENEFITS.map(({ description, Icon, title }) => (
          <div
            className="rounded-lg border border-border bg-card/60 p-6"
            key={title}
          >
            <Icon className="size-5 text-foreground" />
            <h3 className="mt-5 font-medium text-foreground text-xl tracking-tight">
              {title}
            </h3>
            <p className="mt-3 text-muted-foreground text-sm leading-relaxed">
              {description}
            </p>
          </div>
        ))}
      </div>
    </FadeIn>

    {STORY_SECTIONS.map((section, index) => {
      const reversed = index % 2 === 1;

      return (
        <div
          className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16"
          key={section.title}
        >
          <FadeIn className={reversed ? "lg:order-2" : undefined}>
            <div className="max-w-xl mx-auto">
              <h2 className="text-balance font-medium text-3xl text-foreground tracking-tight sm:text-4xl">
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

    <FadeIn>
      <div className="border-border/70 border-t pt-16 sm:pt-20">
        <div className="max-w-2xl">
          <h2 className="text-balance font-medium text-3xl text-foreground tracking-tight sm:text-4xl">
            Keep the core small, then add the pieces your app needs.
          </h2>
          <p className="mt-4 text-pretty text-base text-muted-foreground leading-relaxed sm:text-lg">
            Use the plain job handle for scripts and workers, then layer in
            pooling, route handlers, durable stores, and provider coverage as
            your workload moves into production.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {FEATURES.map((feature) => (
            <Link
              className="group rounded-lg border border-border bg-card/60 p-6 transition-colors hover:bg-accent/40"
              href={feature.href}
              key={feature.title}
            >
              <h3 className="font-medium text-foreground text-xl tracking-tight">
                {feature.title}
              </h3>
              <p className="mt-3 text-muted-foreground text-sm leading-relaxed">
                {feature.description}
              </p>
              <span className="mt-5 inline-flex items-center gap-1.5 font-medium text-foreground text-sm">
                Learn more
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </FadeIn>
  </section>
);
