import type { BatchProvider } from "../types";
import type { BatchAdapter } from "./adapter";
import { anthropicAdapter } from "./anthropic";
import { googleAdapter } from "./google";
import { groqAdapter } from "./groq";
import { mistralAdapter } from "./mistral";
import { openaiAdapter } from "./openai";
import { togetherAdapter } from "./together";
import { xaiAdapter } from "./xai";

const adapters: Record<BatchProvider, BatchAdapter> = {
  anthropic: anthropicAdapter,
  google: googleAdapter,
  groq: groqAdapter,
  mistral: mistralAdapter,
  openai: openaiAdapter,
  together: togetherAdapter,
  xai: xaiAdapter,
};

export const getAdapter = (provider: BatchProvider): BatchAdapter =>
  adapters[provider];

export type { BatchAdapter, SubmitInput } from "./adapter";
