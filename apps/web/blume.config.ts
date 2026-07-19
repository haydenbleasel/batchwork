import { defineConfig } from "blume";

export default defineConfig({
  analytics: { vercel: true },
  content: {
    sources: [
      // Local docs under docs/ → /docs/* (the marketing homepage owns "/").
      { prefix: "docs", root: "docs", type: "filesystem" },
      // Batchwork's GitHub releases become the changelog timeline at /changelog
      // (each release is a type:changelog entry). Set GITHUB_TOKEN in CI to
      // avoid rate limits; a failed fetch degrades to an empty changelog.
      {
        owner: "haydenbleasel",
        prefix: "changelog",
        repo: "batchwork",
        type: "github-releases",
      },
    ],
  },
  deployment: {
    adapter: "vercel",
  },
  description:
    "Unified batch API for AI providers — run thousands of LLM requests at ~50% cost across OpenAI, Anthropic, Gemini, Groq, Mistral, Together AI, and xAI.",
  github: {
    branch: "main",
    dir: "apps/web/docs",
    owner: "haydenbleasel",
    repo: "batchwork",
  },
  logo: { image: "/logo.svg", text: "Batchwork" },
  navigation: {
    tabs: [
      { label: "Docs", path: "/docs" },
      { label: "Changelog", path: "/changelog" },
    ],
  },
  theme: {
    accent: "orange",
  },
  title: "Batchwork",
});
