import { getPrismaClient } from "@/services/database";

export type RetrievedSopChunk = {
  id: string;
  sopDocumentId: string;
  ordinal: number;
  text: string;
};

export async function findMostSimilarSopChunks(
  queryEmbedding: number[],
  k: number,
): Promise<RetrievedSopChunk[]> {
  const vectorLiteral = `[${queryEmbedding.join(",")}]`;

  return getPrismaClient().$queryRaw<RetrievedSopChunk[]>`
    SELECT id, "sopDocumentId", ordinal, text
    FROM "sop_chunks"
    ORDER BY "embedding" <=> ${vectorLiteral}::vector
    LIMIT ${k}
  `;
}
