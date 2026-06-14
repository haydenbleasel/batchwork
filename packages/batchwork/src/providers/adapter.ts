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
  /** Endpoint path the captured requests target (e.g. `/v1/chat/completions`). */
  endpoint: string;
  metadata?: Record<string, string>;
  /**
   * Resolved model id. Needed by providers that set the model on the batch/job
   * (Gemini puts it in the create URL, Mistral on the job); ignored by providers
   * that carry the model in each request line (OpenAI, Anthropic).
   */
  modelId: string;
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
