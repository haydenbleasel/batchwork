import pkg from "../../../packages/batchwork/package.json";

export const getLatestVersion = (): string => pkg.version;
