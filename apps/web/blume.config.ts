import { defineConfig } from "blume";

export default defineConfig({
  ai: { llmsTxt: true },
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
    "Unified batch API for AI providers — one call to run thousands of LLM requests at ~50% cost across OpenAI, Anthropic, Gemini, Groq, Mistral, Together AI, and xAI.",
  github: {
    branch: "main",
    dir: "apps/web/docs",
    owner: "haydenbleasel",
    repo: "batchwork",
  },
  logo: { image: "/logo.svg", text: "Batchwork" },
  markdown: {
    codeBlocks: {
      theme: { dark: "catppuccin-mocha", light: "catppuccin-latte" },
    },
  },
  navigation: {
    sidebar: {
      display: "group",
    },
    tabs: [
      { label: "Docs", path: "/docs" },
      { label: "Changelog", path: "/changelog" },
    ],
  },
  // Redirects (old root URLs → /docs/*, and the index-less /docs/providers tab
  // target) live in vercel.json — one source of truth Vercel reads at the app
  // root. Blume leaves it untouched.
  theme: {
    // The brand is monochrome — keep accents neutral (near-black / near-white)
    // rather than Blume's default blue.
    accent: { dark: "#fafafa", light: "#0a0a0a" },
    fonts: { body: "geist", display: "geist", mono: "geist-mono" },
  },
  title: "Batchwork",
});
