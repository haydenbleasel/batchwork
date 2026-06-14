import { Coins, FileJson, Layers, Webhook } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { FadeIn } from "@/components/fade-in";

interface Feature {
  description: string;
  href: string;
  icon: LucideIcon;
  title: string;
}

const FEATURES: Feature[] = [
  {
    description:
      "One batch() call across OpenAI and Anthropic. Author requests in the same generateText shape you already use, get back one normalized result type keyed by customId.",
    href: "/usage",
    icon: Layers,
    title: "Unified interface",
  },
  {
    description:
      "Every provider's Batch API runs at roughly half the price of synchronous calls. Same models, same prompts — half the bill.",
    href: "/overview",
    icon: Coins,
    title: "~50% cheaper",
  },
  {
    description:
      "OpenAI wants a JSONL file upload; Anthropic wants an inline array. batchwork builds, uploads, polls, and parses results so you never touch the wire format.",
    href: "/providers",
    icon: FileJson,
    title: "JSONL handled",
  },
  {
    description:
      "The server layer watches open batches and fires one signed webhook when each finishes — native provider webhooks where they exist, managed polling everywhere else.",
    href: "/server",
    icon: Webhook,
    title: "One webhook",
  },
];

export const Features = () => (
  <section className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
    <FadeIn>
      <h2 className="max-w-[20ch] text-balance font-medium text-3xl text-foreground tracking-tight sm:text-4xl">
        The batch piece the AI SDK is missing.
      </h2>
      <p className="mt-4 max-w-[60ch] text-pretty text-base text-muted-foreground leading-relaxed sm:text-lg">
        The Vercel AI SDK unifies synchronous generation but has no batch
        support. batchwork closes that gap without making you leave the SDK.
      </p>
    </FadeIn>

    <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2">
      {FEATURES.map(({ description, href, icon: Icon, title }, index) => (
        <FadeIn delay={index * 0.06} key={title}>
          <Link
            className="group flex h-full flex-col gap-3 bg-card p-7 transition-colors hover:bg-muted/40"
            href={href}
          >
            <Icon className="size-5 text-muted-foreground" />
            <h3 className="font-medium text-foreground text-lg tracking-tight">
              {title}
            </h3>
            <p className="text-pretty text-muted-foreground text-sm leading-relaxed">
              {description}
            </p>
          </Link>
        </FadeIn>
      ))}
    </div>
  </section>
);
