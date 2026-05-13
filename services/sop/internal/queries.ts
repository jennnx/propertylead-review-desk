import { getPrismaClient } from "@/services/database";

import type { RetrievedSopChunk } from "./retrieval";

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
