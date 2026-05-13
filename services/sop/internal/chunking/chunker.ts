import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

import {
  SOP_CHUNK_OVERLAP_TOKENS,
  SOP_CHUNK_TARGET_TOKENS,
  SOP_MARKDOWN_SPLITTER_LANGUAGE,
} from "./constants";

export type SopChunkText = {
  ordinal: number;
  text: string;
};

export async function chunkSopText(
  text: string,
  contentType: string,
): Promise<SopChunkText[]> {
  const splitter = createSplitter(contentType);
  const chunks = await splitter.splitText(text);

  return chunks
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .map((chunk, ordinal) => ({
      ordinal,
      text: chunk,
    }));
}

function createSplitter(contentType: string): RecursiveCharacterTextSplitter {
  const options = {
    chunkSize: SOP_CHUNK_TARGET_TOKENS,
    chunkOverlap: SOP_CHUNK_OVERLAP_TOKENS,
    lengthFunction: countApproximateTokens,
  };

  if (contentType === "text/markdown") {
    return RecursiveCharacterTextSplitter.fromLanguage(
      SOP_MARKDOWN_SPLITTER_LANGUAGE,
      options,
    );
  }

  return new RecursiveCharacterTextSplitter(options);
}

function countApproximateTokens(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
