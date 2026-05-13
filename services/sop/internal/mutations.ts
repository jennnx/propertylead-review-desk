import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import { getPrismaClient } from "@/services/database";

export type RecordSopDocumentUploadInput = {
  id: string;
  originalFilename: string;
  contentType: string;
  byteSize: number;
  storagePath: string;
};

export type SopDocumentRow = {
  id: string;
  originalFilename: string;
  contentType: string;
  byteSize: number;
  storagePath: string;
  uploadedAt: Date;
  processingStatus: "PROCESSING" | "READY" | "FAILED";
  failureMessage: string | null;
};

export type SopChunkWithEmbedding = {
  ordinal: number;
  text: string;
  embedding: number[];
};

export async function recordSopDocumentUpload(
  input: RecordSopDocumentUploadInput,
): Promise<SopDocumentRow> {
  return getPrismaClient().sopDocument.create({
    data: {
      id: input.id,
      originalFilename: input.originalFilename,
      contentType: input.contentType,
      byteSize: input.byteSize,
      storagePath: input.storagePath,
      processingStatus: "PROCESSING",
      failureMessage: null,
    },
  });
}

export async function markSopDocumentFailed(
  id: string,
  failureMessage: string,
): Promise<void> {
  await getPrismaClient().sopDocument.update({
    where: { id },
    data: {
      processingStatus: "FAILED",
      failureMessage,
    },
  });
}

export async function replaceSopChunks(
  documentId: string,
  chunks: SopChunkWithEmbedding[],
): Promise<void> {
  await getPrismaClient().$transaction(async (tx) => {
    await tx.sopChunk.deleteMany({
      where: { sopDocumentId: documentId },
    });

    for (const chunk of chunks) {
      const vectorLiteral = `[${chunk.embedding.join(",")}]`;
      await tx.$executeRaw`
        INSERT INTO "sop_chunks" ("id", "sopDocumentId", "ordinal", "text", "embedding")
        VALUES (${randomUUID()}, ${documentId}, ${chunk.ordinal}, ${chunk.text}, ${vectorLiteral}::vector)
      `;
    }

    await tx.sopDocument.update({
      where: { id: documentId },
      data: {
        processingStatus: "READY",
        failureMessage: null,
      },
    });
  });
}

export async function deleteSopDocumentRow(
  id: string,
): Promise<{ storagePath: string } | null> {
  try {
    return await getPrismaClient().sopDocument.delete({
      where: { id },
      select: { storagePath: true },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return null;
    }
    throw error;
  }
}
