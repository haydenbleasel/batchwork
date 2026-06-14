/** Base error for all batchwork failures. */
export class BatchworkError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "BatchworkError";
  }
}

/** Thrown when a model resolves to a provider without a batch adapter. */
export class UnsupportedProviderError extends BatchworkError {
  readonly provider: string;

  constructor(provider: string) {
    super(
      `batchwork: provider "${provider}" is not supported yet. Supported providers: openai, anthropic.`
    );
    this.name = "UnsupportedProviderError";
    this.provider = provider;
  }
}

/** Thrown when an optional provider package is not installed. */
export class MissingDependencyError extends BatchworkError {
  constructor(pkg: string, provider: string) {
    super(
      `batchwork: install \`${pkg}\` to batch ${provider} models (\`npm install ${pkg}\`).`
    );
    this.name = "MissingDependencyError";
  }
}
