import { SOP_CHUNK_UNICODE_NORMALIZATION_FORM } from "./chunking/constants";

const TXT_CONTENT_TYPE = "text/plain";

export function extractSopText(buffer: Buffer, contentType: string): string {
  if (contentType !== TXT_CONTENT_TYPE) {
    throw new Error(`Unsupported SOP Document content type: ${contentType}`);
  }

  const text = normalizeSopText(buffer.toString("utf8"));
  if (text.trim().length === 0) {
    throw new Error("SOP Document did not contain any text.");
  }

  return text;
}

function normalizeSopText(text: string): string {
  return text
    .normalize(SOP_CHUNK_UNICODE_NORMALIZATION_FORM)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
