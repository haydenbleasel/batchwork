"use client";

import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";

import { InstallCommand } from "@/components/install-command";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;

const CODE = `import { batch } from "batchwork";
import { openai } from "@ai-sdk/openai";

const job = await batch({
  model: openai.chat("gpt-4o-mini"),
  requests: [
    { customId: "a", prompt: "Summarize this…" },
    { customId: "b", prompt: "Translate this…" },
  ],
});

// one call — JSONL, upload, and polling handled for you
for (const r of await job.wait().then(() => job.collect())) {
  console.log(r.customId, r.status, r.text);
}`;

const PROVIDERS = [
  { available: true, name: "OpenAI" },
  { available: true, name: "Anthropic" },
  { available: false, name: "Gemini" },
  { available: false, name: "Mistral" },
  { available: false, name: "Groq" },
  { available: false, name: "Bedrock" },
];

interface HeroProps {
  latestVersion: string;
}

export const Hero = ({ latestVersion }: HeroProps) => (
  <section className="relative overflow-hidden">
    <div className="mx-auto flex max-w-5xl flex-col items-center px-6 pt-24 pb-16 text-center sm:pt-32 lg:pt-40">
      <motion.a
        animate={{ opacity: 1 }}
        className="group inline-flex items-center gap-2 font-mono text-muted-foreground text-xs transition-colors hover:text-foreground"
        href="https://github.com/haydenbleasel/batchwork"
        initial={{ opacity: 0 }}
        rel="noreferrer"
        target="_blank"
        transition={{ duration: 0.4, ease: EASE }}
      >
        <span className="inline-block size-1.5 rounded-full bg-emerald-500" />v
        {latestVersion} · OpenAI + Anthropic
        <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
      </motion.a>

      <motion.h1
        animate={{ opacity: 1, y: 0 }}
        className="mt-8 max-w-[16ch] text-balance font-medium text-[2.5rem]/[1.05] text-foreground tracking-tight sm:text-7xl lg:text-8xl"
        initial={{ opacity: 0, y: 12 }}
        transition={{ delay: 0.08, duration: 0.7, ease: EASE }}
      >
        Batch the AI SDK.
      </motion.h1>

      <motion.p
        animate={{ opacity: 1, y: 0 }}
        className="mt-7 max-w-[56ch] text-pretty text-base text-muted-foreground leading-relaxed sm:text-xl"
        initial={{ opacity: 0, y: 12 }}
        transition={{ delay: 0.18, duration: 0.6, ease: EASE }}
      >
        Submit thousands of LLM requests at ~50% cost with one unified call.
        Same models, same request shape as <code>generateText</code> — JSONL,
        uploads, polling, and result parsing handled for you.
      </motion.p>

      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="mt-10 flex flex-wrap items-center justify-center gap-3"
        initial={{ opacity: 0, y: 12 }}
        transition={{ delay: 0.26, duration: 0.6, ease: EASE }}
      >
        <InstallCommand />
        <Button asChild size="lg" variant="ghost">
          <Link href="/overview">
            Read the docs
            <ArrowRight data-icon="inline-end" />
          </Link>
        </Button>
      </motion.div>
    </div>

    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-3xl px-6 pb-12"
      initial={{ opacity: 0, y: 16 }}
      transition={{ delay: 0.36, duration: 0.7, ease: EASE }}
    >
      <div className="overflow-hidden rounded-2xl border border-border bg-card text-left shadow-sm">
        <div className="flex items-center gap-1.5 border-b border-dotted px-4 py-3">
          <span className="size-2.5 rounded-full bg-muted-foreground/25" />
          <span className="size-2.5 rounded-full bg-muted-foreground/25" />
          <span className="size-2.5 rounded-full bg-muted-foreground/25" />
          <span className="ml-2 font-mono text-muted-foreground text-xs">
            batch.ts
          </span>
        </div>
        <pre className="overflow-x-auto px-5 py-4 font-mono text-[13px] text-foreground leading-relaxed">
          {CODE}
        </pre>
      </div>
    </motion.div>

    <motion.div
      animate={{ opacity: 1 }}
      className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-2 px-6 pb-24"
      initial={{ opacity: 0 }}
      transition={{ delay: 0.5, duration: 0.7, ease: EASE }}
    >
      {PROVIDERS.map((provider) => (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-4xl border border-border px-3 py-1 font-mono text-xs",
            provider.available
              ? "bg-input/30 text-foreground"
              : "text-muted-foreground/70"
          )}
          key={provider.name}
        >
          {provider.name}
          {provider.available ? null : (
            <span className="text-[10px] text-muted-foreground/50">soon</span>
          )}
        </span>
      ))}
    </motion.div>
  </section>
);
