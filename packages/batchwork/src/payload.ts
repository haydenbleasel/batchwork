import { BatchworkError } from "./errors";
import { assertByteCount, byteLength } from "./limits";

interface JsonArrayPayloadOptions {
  items: readonly unknown[];
  label: string;
  maxBytes: number;
  prefix: string;
  suffix: string;
}

export const encodeJsonArrayPayload = ({
  items,
  label,
  maxBytes,
  prefix,
  suffix,
}: JsonArrayPayloadOptions): string => {
  const encodedItems: string[] = [];
  let bytes = byteLength(prefix) + byteLength(suffix);
  assertByteCount(label, bytes, maxBytes);

  for (const [index, item] of items.entries()) {
    const encoded = JSON.stringify(item);
    if (encoded === undefined) {
      throw new BatchworkError(
        `batchwork: ${label} contains a value that cannot be JSON encoded.`
      );
    }
    bytes += byteLength(encoded);
    if (index > 0) {
      bytes += 1;
    }
    assertByteCount(label, bytes, maxBytes);
    encodedItems.push(encoded);
  }

  return `${prefix}${encodedItems.join(",")}${suffix}`;
};
