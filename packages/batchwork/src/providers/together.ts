import { BatchworkError } from "../errors";
import { requestJson } from "../http";
import { createOpenAICompatibleAdapter } from "./openai-compatible";

const INPUT_FILE_NAME = "batchwork.jsonl";
const HTTP_FOUND = 302;

const safeText = async (response: Response): Promise<string> => {
  try {
    return await response.text();
  } catch {
    return "<no body>";
  }
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
      `batchwork: Together upload could not be initiated (${init.status}): ${await safeText(init)}`
    );
  }

  // The presigned URL carries its own auth; sending Together's would break it.
  const upload = await fetch(location, { body: args.jsonl, method: "PUT" });
  if (!upload.ok) {
    throw new BatchworkError(
      `batchwork: Together file upload failed (${upload.status}): ${await safeText(upload)}`
    );
  }

  await requestJson(`${args.baseUrl}/files/${fileId}/preprocess`, {
    headers: args.headers,
    method: "POST",
  });
  return fileId;
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
