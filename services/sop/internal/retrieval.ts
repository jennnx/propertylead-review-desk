import { z } from "zod";

import { createVoyageEmbeddingClient } from "./embedding/client";
import { findMostSimilarSopChunks } from "./queries";

export type RetrievedSopChunk = {
  id: string;
  sopDocumentId: string;
  ordinal: number;
  text: string;
};

const inputSchema = z.object({
  query: z.string().trim().min(1).max(8000),
  k: z.number().int().min(1).max(100),
});

export async function retrieveRelevantSopChunks(
  query: string,
  k: number,
): Promise<RetrievedSopChunk[]> {
  const parsed = inputSchema.safeParse({ query, k });
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Invalid retrieveRelevantSopChunks input",
    );
  }

  const embeddingClient = createVoyageEmbeddingClient();
  const [embedding] = await embeddingClient.embedTexts([parsed.data.query]);
  if (!embedding) {
    throw new Error(
      "Voyage embeddings response did not include an embedding for the query",
    );
  }

  return findMostSimilarSopChunks(embedding, parsed.data.k);
}
