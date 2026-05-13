import { extractText, getDocumentProxy } from "unpdf";

import { SOP_CHUNK_UNICODE_NORMALIZATION_FORM } from "./chunking/constants";

const TXT_CONTENT_TYPE = "text/plain";
const MARKDOWN_CONTENT_TYPE = "text/markdown";
const PDF_CONTENT_TYPE = "application/pdf";

export async function extractSopText(
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  const rawText = await extractRawText(buffer, contentType);
  const text = normalizeSopText(rawText);
  if (text.trim().length === 0) {
    throw new Error("SOP Document did not contain any text.");
  }

  return text;
}

async function extractRawText(
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  if (
    contentType === TXT_CONTENT_TYPE ||
    contentType === MARKDOWN_CONTENT_TYPE
  ) {
    return buffer.toString("utf8");
  }

  if (contentType === PDF_CONTENT_TYPE) {
    return extractPdfText(buffer);
  }

  throw new Error(`Unsupported SOP Document content type: ${contentType}`);
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const pdf = await getDocumentProxy(
      new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength),
    );
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`SOP Document PDF could not be parsed: ${reason}`);
  }
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
