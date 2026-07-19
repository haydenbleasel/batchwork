// See all configuration options: https://remotion.dev/docs/config
// Each option also is available as a CLI flag: https://remotion.dev/docs/cli

import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setConcurrency(null);

// The repo's `typescript` is the native preview (v7), which lacks the Node API
// (`typescript.sys`) Remotion's esbuild-loader uses to read tsconfig.json.
// Injecting `tsconfigRaw` into the loader options makes it skip that require
// entirely — esbuild only needs the JSX mode and target.
const TSCONFIG_RAW = {
  compilerOptions: { jsx: "react-jsx", target: "ES2022" },
};

interface EsbuildRule {
  use?: { loader?: string; options?: Record<string, unknown> }[];
}

Config.overrideWebpackConfig((config) => {
  const rules = (config.module?.rules ?? []) as EsbuildRule[];
  for (const rule of rules) {
    for (const use of rule?.use ?? []) {
      if (use?.loader?.includes("esbuild-loader") && use.options) {
        use.options.tsconfigRaw = TSCONFIG_RAW;
      }
    }
  }
  return config;
});
