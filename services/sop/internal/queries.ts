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
