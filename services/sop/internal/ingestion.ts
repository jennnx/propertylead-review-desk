import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { getPrismaClient } from "@/services/database";

import { chunkSopText } from "./chunking/chunker";
import { createVoyageEmbeddingClient } from "./embedding/client";
import { extractSopText } from "./parsing";

export type ProcessSopIngestionJobInput = {
  sopDocumentId: string;
};

export async function processSopIngestionJob({
  sopDocumentId,
}: ProcessSopIngestionJobInput): Promise<void> {
  try {
    await ingestSopDocument(sopDocumentId);
  } catch (error) {
    await markDocumentFailed(sopDocumentId, toFailureMessage(error));
    throw error;
  }
}

async function ingestSopDocument(sopDocumentId: string): Promise<void> {
  const prisma = getPrismaClient();
  const document = await prisma.sopDocument.findUnique({
    where: {
      id: sopDocumentId,
    },
  });

  if (!document) {
    throw new Error(`SOP Document ${sopDocumentId} was not found.`);
  }

  const file = await readFile(document.storagePath);
  const text = extractSopText(file, document.contentType);
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

  await prisma.$transaction(async (tx) => {
    await tx.sopChunk.deleteMany({
      where: {
        sopDocumentId: document.id,
      },
    });

    for (const chunk of chunks) {
      const vectorLiteral = `[${embeddings[chunk.ordinal].join(",")}]`;
      await tx.$executeRaw`
        INSERT INTO "sop_chunks" ("id", "sopDocumentId", "ordinal", "text", "embedding")
        VALUES (${randomUUID()}, ${document.id}, ${chunk.ordinal}, ${chunk.text}, ${vectorLiteral}::vector)
      `;
    }

    await tx.sopDocument.update({
      where: {
        id: document.id,
      },
      data: {
        processingStatus: "READY",
        failureMessage: null,
      },
    });
  });
}

async function markDocumentFailed(
  sopDocumentId: string,
  failureMessage: string,
): Promise<void> {
  await getPrismaClient().sopDocument.update({
    where: {
      id: sopDocumentId,
    },
    data: {
      processingStatus: "FAILED",
      failureMessage,
    },
  });
}

function toFailureMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "SOP Document ingestion failed.";
}
