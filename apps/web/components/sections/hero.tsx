"use client";

import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import type { ReactNode } from "react";

import { InstallCommand } from "@/components/install-command";
import {
  Anthropic,
  Gemini,
  Mistral,
  OpenAI,
  Groq,
  Together,
  Xai,
} from "@/components/logos";
import { Button } from "@/components/ui/button";

const EASE = [0.16, 1, 0.3, 1] as const;

const LOGOS = [
  { Icon: OpenAI, name: "OpenAI" },
  { Icon: Anthropic, name: "Anthropic" },
  { Icon: Gemini, name: "Google Gemini" },
  { Icon: Mistral, name: "Mistral AI" },
  { Icon: Xai, name: "X.ai" },
  { Icon: Groq, name: "Groq" },
  { Icon: Together, name: "Together AI" },
];

interface HeroProps {
  latestVersion: string;
  /** The shiki-highlighted code demo, rendered server-side. */
  children: ReactNode;
}

export const Hero = ({ latestVersion, children }: HeroProps) => (
  <section className="relative overflow-hidden">
    <div className="mx-auto flex max-w-5xl flex-col items-center px-6 pt-24 pb-16 text-center sm:pt-32 lg:pt-40">
      <motion.a
        animate={{ opacity: 1 }}
        className="group inline-flex items-center gap-2 font-mono text-muted-foreground text-xs transition-colors hover:text-foreground"
        href={`https://github.com/haydenbleasel/batchwork/releases/tag/${encodeURIComponent(
          `batchwork@${latestVersion}`
        )}`}
        initial={{ opacity: 0 }}
        rel="noreferrer"
        target="_blank"
        transition={{ duration: 0.4, ease: EASE }}
      >
        <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
        Latest update — v{latestVersion} released
        <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
      </motion.a>

      <motion.h1
        animate={{ opacity: 1, y: 0 }}
        className="mt-8 max-w-[14ch] text-balance font-medium text-[2.5rem]/[1.05] text-foreground tracking-tighter sm:text-7xl"
        initial={{ opacity: 0, y: 12 }}
        transition={{ delay: 0.08, duration: 0.7, ease: EASE }}
      >
        Save up to 50% on <span className="sr-only">LLM</span>
        <motion.span
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex translate-y-3 -space-x-2 items-center justify-center"
          initial={{ opacity: 0, y: 12 }}
          transition={{ delay: 0.14, duration: 0.6, ease: EASE }}
        >
          {LOGOS.map(({ Icon, name }) => (
            <Icon
              className="size-12 ring-4 ring-background sm:size-16 rounded-full"
              key={name}
            />
          ))}
        </motion.span>{" "}
        costs
      </motion.h1>

      <motion.p
        animate={{ opacity: 1, y: 0 }}
        className="mt-8 max-w-xl text-pretty text-base text-muted-foreground leading-relaxed sm:text-xl"
        initial={{ opacity: 0, y: 12 }}
        transition={{ delay: 0.22, duration: 0.6, ease: EASE }}
      >
        Unified batch API for AI providers. Process LLM requests in bulk with a
        single call for lower costs. Processing, uploading, polling, and result
        parsing handled for you.
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
      className="mx-auto max-w-3xl px-6 pb-24"
      initial={{ opacity: 0, y: 16 }}
      transition={{ delay: 0.36, duration: 0.7, ease: EASE }}
    >
      {children}
    </motion.div>
  </section>
);
