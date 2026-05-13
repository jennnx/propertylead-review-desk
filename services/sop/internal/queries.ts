import { z } from "zod";

import { getPrismaClient } from "@/services/database";

const sopChunkRowSchema = z.object({
  id: z.string(),
  sopDocumentId: z.string(),
  ordinal: z.number().int(),
  text: z.string(),
});

const sopChunkRowsSchema = z.array(sopChunkRowSchema);

export type RetrievedSopChunk = z.infer<typeof sopChunkRowSchema>;

export type SopDocumentForIngestion = {
  id: string;
  originalFilename: string;
  contentType: string;
  byteSize: number;
  storagePath: string;
  uploadedAt: Date;
  processingStatus: "PROCESSING" | "READY" | "FAILED";
  failureMessage: string | null;
};

export type SopDocumentSummaryRow = {
  id: string;
  originalFilename: string;
  contentType: string;
  byteSize: number;
  uploadedAt: Date;
  processingStatus: "PROCESSING" | "READY" | "FAILED";
  failureMessage: string | null;
  chunkCount: number;
};

export async function findSopDocumentById(
  id: string,
): Promise<SopDocumentForIngestion | null> {
  return getPrismaClient().sopDocument.findUnique({
    where: { id },
  });
}

export async function listRecentSopDocuments(
  limit: number,
): Promise<SopDocumentSummaryRow[]> {
  const documents = await getPrismaClient().sopDocument.findMany({
    orderBy: { uploadedAt: "desc" },
    take: limit,
    include: {
      _count: {
        select: { chunks: true },
      },
    },
  });

  return documents.map((document) => {
    const { storagePath: _storagePath, _count, ...summary } = document;
    void _storagePath;
    return {
      ...summary,
      chunkCount: _count.chunks,
    };
  });
}

export async function findMostSimilarSopChunks(
  queryEmbedding: number[],
  k: number,
): Promise<RetrievedSopChunk[]> {
  const vectorLiteral = `[${queryEmbedding.join(",")}]`;

  const rows = await getPrismaClient().$queryRaw`
    SELECT c.id, c."sopDocumentId", c.ordinal, c.text
    FROM "sop_chunks" c
    JOIN "sop_documents" d ON d.id = c."sopDocumentId"
    WHERE d."processingStatus" = 'ready'::"SopDocumentProcessingStatus"
    ORDER BY c."embedding" <=> ${vectorLiteral}::vector
    LIMIT ${k}
  `;

  return sopChunkRowsSchema.parse(rows);
}
