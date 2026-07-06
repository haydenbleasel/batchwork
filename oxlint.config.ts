import { defineConfig } from "oxlint";
import astro from "ultracite/oxlint/astro";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";

export default defineConfig({
  extends: [core, react, astro],
  ignorePatterns: core.ignorePatterns,
  overrides: [
    {
      // Live tests opt in via the `.live.test.ts` suffix so the default
      // `bun test` run skips them; the extra dot is intentional.
      files: ["packages/batchwork/live/*.live.test.ts"],
      rules: { "github/filenames-match-regex": "off" },
    },
    {
      // Remotion styles are recomputed per frame from `useCurrentFrame()`,
      // so they cannot move to static CSS classes.
      files: ["packages/videos/**"],
      rules: { "react-doctor/no-inline-exhaustive-style": "off" },
    },
  ],
});
