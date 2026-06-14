import type { BatchProvider } from "../types";
import type { BatchAdapter } from "./adapter";
import { anthropicAdapter } from "./anthropic";
import { openaiAdapter } from "./openai";

const adapters: Record<BatchProvider, BatchAdapter> = {
  anthropic: anthropicAdapter,
  openai: openaiAdapter,
};

export const getAdapter = (provider: BatchProvider): BatchAdapter =>
  adapters[provider];

export type { BatchAdapter, SubmitInput } from "./adapter";
