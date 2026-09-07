import { readFile } from "node:fs/promises";
import path from "node:path";

// blume runs from the docs package dir (apps/web), so reach up to the
// workspace's published package for its current version.
const packageJsonPath = path.join(
  process.cwd(),
  "..",
  "..",
  "packages",
  "batchwork",
  "package.json"
);

let cached: string | undefined;

export const getLatestVersion = async (): Promise<string> => {
  if (cached) {
    return cached;
  }

  const raw = await readFile(packageJsonPath, "utf-8");
  // SAFETY: this is the workspace's own package manifest, and `version` is a
  // required string field of every publishable package.json.
  const { version } = JSON.parse(raw) as { version: string };

  cached = version;
  return version;
};
