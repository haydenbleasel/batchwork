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

const repoUrl = "https://github.com/haydenbleasel/batchwork";

let cached: string | undefined;

export const getLatestVersion = async (): Promise<string> => {
  if (cached) {
    return cached;
  }

  const raw = await readFile(packageJsonPath, "utf-8");
  const { version } = JSON.parse(raw) as { version: string };

  cached = version;
  return version;
};

export const getReleaseUrl = (version: string): string =>
  `${repoUrl}/releases/tag/batchwork%40${version}`;
