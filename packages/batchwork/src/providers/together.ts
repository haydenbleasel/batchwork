import { BatchworkError } from "../errors";
import { requestJson } from "../http";
import { assertSimpleProviderId } from "./ids";
import { createOpenAICompatibleAdapter } from "./openai-compatible";

const INPUT_FILE_NAME = "batchwork.jsonl";
const HTTP_FOUND = 302;

const parseIpv4 = (host: string): number[] | undefined => {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(host)) {
    return;
  }
  const parts = host.split(".").map(Number);
  const valid = parts.every(
    (part) => Number.isInteger(part) && part >= 0 && part <= 255
  );
  return valid ? parts : undefined;
};

const isPrivateIpv4 = (parts: number[]): boolean => {
  const [a = 0, b = 0] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
};

const isPrivateIpv6 = (host: string): boolean => {
  const normalized = host.replace(/^\[/u, "").replace(/\]$/u, "").toLowerCase();
  // Only an IPv6 literal can be a private address, and one always contains a
  // colon — guard so a bare DNS name like `fc2.com` is not mistaken for `fc00::/7`.
  if (!normalized.includes(":")) {
    return false;
  }
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
};

const validateUploadLocation = (location: string): string => {
  let url: URL;
  try {
    url = new URL(location);
  } catch (error) {
    throw new BatchworkError(
      "batchwork: Together upload Location must be a valid URL.",
      { cause: error }
    );
  }
  if (url.protocol !== "https:") {
    throw new BatchworkError(
      "batchwork: Together upload Location must use https."
    );
  }
  if (url.username || url.password) {
    throw new BatchworkError(
      "batchwork: Together upload Location must not include credentials."
    );
  }
  const host = url.hostname.toLowerCase();
  const ipv4 = parseIpv4(host);
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    (ipv4 && isPrivateIpv4(ipv4)) ||
    isPrivateIpv6(host)
  ) {
    throw new BatchworkError(
      "batchwork: Together upload Location must not target localhost or private networks."
    );
  }
  return url.toString();
};

/**
 * Together uploads files via a presigned URL rather than a direct multipart
 * upload of the bytes. The flow is three steps:
 *
 *   1. `POST /files` with multipart *metadata only* (`purpose`, `file_name`,
 *      `file_type` — no file part) responds `302` with a `Location` (the
 *      presigned storage URL) and an `X-Together-File-Id` header.
 *   2. `PUT` the raw bytes to that `Location` (no auth — the URL is signed).
 *   3. `POST /files/{id}/preprocess` to finalize the upload.
 */
const uploadTogetherFile = async (args: {
  baseUrl: string;
  headers: Record<string, string>;
  jsonl: string;
  purpose: string;
}): Promise<string> => {
  const metadata = new FormData();
  metadata.append("purpose", args.purpose);
  metadata.append("file_name", INPUT_FILE_NAME);
  metadata.append("file_type", "jsonl");
  const init = await fetch(`${args.baseUrl}/files`, {
    body: metadata,
    // Let fetch set the multipart content-type/boundary; only auth is needed.
    headers: args.headers,
    method: "POST",
    // Together signals the presigned URL via a redirect we must read, not follow.
    redirect: "manual",
  });
  const location = init.headers.get("location");
  const fileId = init.headers.get("x-together-file-id");
  if (init.status !== HTTP_FOUND || !(location && fileId)) {
    throw new BatchworkError(
      `batchwork: Together upload could not be initiated (${init.status}).`
    );
  }

  // The presigned URL carries its own auth; sending Together's would break it.
  const uploadLocation = validateUploadLocation(location);
  const upload = await fetch(uploadLocation, {
    body: args.jsonl,
    method: "PUT",
    redirect: "manual",
  });
  if (!upload.ok) {
    throw new BatchworkError(
      `batchwork: Together file upload failed (${upload.status}).`
    );
  }

  const safeFileId = assertSimpleProviderId("Together file id", fileId);
  await requestJson(`${args.baseUrl}/files/${safeFileId}/preprocess`, {
    headers: args.headers,
    method: "POST",
  });
  return safeFileId;
};

/**
 * Together AI batch adapter. Together's batch API mirrors OpenAI's (Files API +
 * `/batches`) but uses the leaner `{ custom_id, body }` input-line shape, with
 * the endpoint declared on the batch rather than per line, and a presigned-URL
 * file upload in place of OpenAI's direct multipart POST.
 */
export const togetherAdapter = createOpenAICompatibleAdapter({
  apiKeyEnv: "TOGETHER_API_KEY",
  apiKeyLabel: "Together AI",
  baseUrl: "https://api.together.xyz/v1",
  filePurpose: "batch-api",
  id: "together",
  lineFormat: "body-only",
  uploadFile: uploadTogetherFile,
});
