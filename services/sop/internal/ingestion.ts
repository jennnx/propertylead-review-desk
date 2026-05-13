import { readFile } from "node:fs/promises";

import { chunkSopText } from "./chunking/chunker";
import { createVoyageEmbeddingClient } from "./embedding/client";
import { markSopDocumentFailed, replaceSopChunks } from "./mutations";
import { extractSopText } from "./parsing";
import { findSopDocumentById } from "./queries";

export type ProcessSopIngestionJobInput = {
  sopDocumentId: string;
};

export async function processSopIngestionJob({
  sopDocumentId,
}: ProcessSopIngestionJobInput): Promise<void> {
  try {
    await ingestSopDocument(sopDocumentId);
  } catch (error) {
    await markSopDocumentFailed(sopDocumentId, toFailureMessage(error));
    throw error;
  }
}

async function ingestSopDocument(sopDocumentId: string): Promise<void> {
  const document = await findSopDocumentById(sopDocumentId);

  if (!document) {
    throw new Error(`SOP Document ${sopDocumentId} was not found.`);
  }

  const file = await readFile(document.storagePath);
  const text = await extractSopText(file, document.contentType);
  const chunks = await chunkSopText(text, document.contentType);
  if (chunks.length === 0) {
    throw new Error("SOP Document did not produce any chunks.");
  }

  const embeddings = await createVoyageEmbeddingClient().embedTexts(
    chunks.map((chunk) => chunk.text),
    {
      inputType: "document",
    },
  );
  if (embeddings.length !== chunks.length) {
    throw new Error("Voyage embeddings response did not match SOP Chunk count.");
  }

  await replaceSopChunks(
    document.id,
    chunks.map((chunk) => ({
      ordinal: chunk.ordinal,
      text: chunk.text,
      embedding: embeddings[chunk.ordinal],
    })),
  );
}

function toFailureMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "SOP Document ingestion failed.";
}
