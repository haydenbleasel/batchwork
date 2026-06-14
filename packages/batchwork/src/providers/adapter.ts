import type { BuiltRequest } from "../body";
import type {
  BatchProvider,
  BatchResult,
  BatchSnapshot,
  ProviderCredentials,
} from "../types";

export interface SubmitInput {
  built: BuiltRequest[];
  credentials: ProviderCredentials;
  /** OpenAI endpoint path (e.g. `/v1/chat/completions`); ignored by Anthropic. */
  endpoint: string;
  metadata?: Record<string, string>;
}

/** A provider's batch lifecycle: submit, poll, stream results, cancel. */
export interface BatchAdapter {
  cancel: (id: string, credentials: ProviderCredentials) => Promise<void>;
  readonly id: BatchProvider;
  results: (
    id: string,
    credentials: ProviderCredentials
  ) => AsyncGenerator<BatchResult>;
  retrieve: (
    id: string,
    credentials: ProviderCredentials
  ) => Promise<BatchSnapshot>;
  submit: (input: SubmitInput) => Promise<BatchSnapshot>;
}
