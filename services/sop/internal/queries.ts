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
    SELECT id, "sopDocumentId", ordinal, text
    FROM "sop_chunks"
    ORDER BY "embedding" <=> ${vectorLiteral}::vector
    LIMIT ${k}
  `;

  return sopChunkRowsSchema.parse(rows);
}
