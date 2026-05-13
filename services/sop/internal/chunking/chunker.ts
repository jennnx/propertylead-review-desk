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
  const trimmedChunks = chunks
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
  const chunksWithContext =
    contentType === "text/markdown"
      ? addMarkdownHeadingContext(text, trimmedChunks)
      : trimmedChunks;

  return chunksWithContext.map((chunk, ordinal) => ({
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

function addMarkdownHeadingContext(source: string, chunks: string[]): string[] {
  const headingPositions = collectMarkdownHeadingPositions(source);
  if (headingPositions.length === 0) {
    return chunks;
  }

  let searchFrom = 0;

  return chunks.map((chunk) => {
    const chunkStart = findChunkStart(source, chunk, searchFrom);
    if (chunkStart >= 0) {
      searchFrom = chunkStart + Math.max(1, chunk.length);
    }

    const headingPath = getHeadingPathAtOffset(
      headingPositions,
      chunkStart >= 0 ? chunkStart : searchFrom,
    );
    if (headingPath.length === 0 || chunkStartsWithHeadingPath(chunk, headingPath)) {
      return chunk;
    }

    return `${headingPath.join(" > ")}\n\n${chunk}`;
  });
}

type MarkdownHeadingPosition = {
  offset: number;
  path: string[];
};

function collectMarkdownHeadingPositions(source: string): MarkdownHeadingPosition[] {
  const headings: MarkdownHeadingPosition[] = [];
  const currentPath: string[] = [];
  const headingPattern = /^(#{1,6})\s+(.+)$/gm;

  for (const match of source.matchAll(headingPattern)) {
    const marker = match[1];
    const rawHeadingText = match[2];
    if (!marker || !rawHeadingText || match.index === undefined) {
      continue;
    }

    const depth = marker.length;
    const text = rawHeadingText.replace(/\s+#+\s*$/, "").trim();
    if (text.length === 0) {
      continue;
    }

    currentPath.length = depth - 1;
    currentPath[depth - 1] = text;
    headings.push({
      offset: match.index,
      path: currentPath.filter(Boolean),
    });
  }

  return headings;
}

function findChunkStart(source: string, chunk: string, searchFrom: number): number {
  const exactStart = source.indexOf(chunk, searchFrom);
  if (exactStart >= 0) {
    return exactStart;
  }

  return source.indexOf(chunk);
}

function getHeadingPathAtOffset(
  headings: MarkdownHeadingPosition[],
  offset: number,
): string[] {
  let path: string[] = [];

  for (const heading of headings) {
    if (heading.offset > offset) {
      break;
    }

    path = heading.path;
  }

  return path;
}

function chunkStartsWithHeadingPath(chunk: string, headingPath: string[]): boolean {
  const firstLine = chunk.split("\n", 1)[0]?.trim() ?? "";
  const headingContext = headingPath.join(" > ");
  if (firstLine === headingContext) {
    return true;
  }

  if (headingPath.length !== 1) {
    return false;
  }

  const [heading] = headingPath;
  return (
    firstLine === heading ||
    firstLine === `# ${heading}` ||
    firstLine === `## ${heading}` ||
    firstLine === `### ${heading}` ||
    firstLine === `#### ${heading}` ||
    firstLine === `##### ${heading}` ||
    firstLine === `###### ${heading}`
  );
}
