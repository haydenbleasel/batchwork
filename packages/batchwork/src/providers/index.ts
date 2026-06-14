import type { BatchProvider } from "../types";
import type { BatchAdapter } from "./adapter";
import { anthropicAdapter } from "./anthropic";
import { openaiAdapter } from "./openai";

const adapters: Record<BatchProvider, BatchAdapter> = {
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
};

export function getAdapter(provider: BatchProvider): BatchAdapter {
  return adapters[provider];
}

export type { BatchAdapter, SubmitInput } from "./adapter";
