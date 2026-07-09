#!/usr/bin/env bun
import { watch as fsWatch } from "node:fs";
// Build the package: JS via Bun's bundler, .d.ts via tsc. Replaces tsdown.
// Bun bundles the entry into dist/; peer/runtime deps (incl. the providers'
// dynamically-imported optional @ai-sdk/* packages) stay external so they load
// lazily at runtime. tsc emits per-file declarations into the same dist/ tree.
import { rm } from "node:fs/promises";
import path from "node:path";

import pkg from "../package.json" with { type: "json" };

const root = path.resolve(import.meta.dirname, "..");
const dist = path.resolve(root, "dist");
const srcDir = path.resolve(root, "src");

// Peer/optional/runtime deps are consumers' responsibility — never bundle them.
const deps = pkg as {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};
const external = [
  ...Object.keys(deps.peerDependencies ?? {}),
  ...Object.keys(deps.dependencies ?? {}),
  ...Object.keys(deps.optionalDependencies ?? {}),
];

// Every published subpath in "exports". `root: src` mirrors the source tree
// into dist/ (so "./dist/index.js" comes from "src/index.ts").
const entrypoints = Object.values(
  pkg.exports as Record<string, { import: string }>
).map(({ import: imp }) =>
  path.resolve(
    root,
    imp.replace(/^\.\/dist\//u, "src/").replace(/\.js$/u, ".ts")
  )
);

const buildJs = async () => {
  const result = await Bun.build({
    entrypoints,
    external,
    format: "esm",
    outdir: dist,
    root: srcDir,
    sourcemap: "linked",
    splitting: true,
    target: "node",
  });
  if (!result.success) {
    for (const log of result.logs) {
      console.error(log.message);
    }
    throw new Error("JS bundle failed");
  }
};

const run = async (cmd: string[], label: string) => {
  const proc = Bun.spawn(cmd, {
    cwd: root,
    stderr: "inherit",
    stdout: "inherit",
  });
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`${label} failed (exit ${code})`);
  }
};

// tsc (TypeScript 7's native Go compiler) emits one .d.ts (+ map) per source file.
const buildTypes = () =>
  run(["bun", "x", "tsc", "-p", "tsconfig.build.json"], "tsc");

const build = async () => {
  const start = performance.now();
  await rm(dist, { force: true, recursive: true });
  await buildJs();
  await buildTypes();
  console.log(
    `build: dist/ ready in ${(performance.now() - start).toFixed(0)}ms`
  );
};

await build();

if (process.argv.includes("--watch")) {
  console.log("build: watching src/ for changes…");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const rebuild = async () => {
    try {
      await build();
    } catch (error) {
      console.error(error);
    }
  };
  fsWatch(srcDir, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(rebuild, 150);
  });
}
