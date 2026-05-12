import { env } from "@/lib/env";

export const VOYAGE_EMBEDDING_MODEL = "voyage-3";
export const VOYAGE_EMBEDDING_DIMENSIONS = 1024;

export type VoyageEmbeddingClient = {
  embedTexts(input: string[]): Promise<number[][]>;
};

type VoyageEmbeddingResponse = {
  data?: Array<{
    embedding?: unknown;
  }>;
};

export function createVoyageEmbeddingClient(): VoyageEmbeddingClient {
  return {
    async embedTexts(texts) {
      const response = await fetch("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.VOYAGE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: texts,
          model: VOYAGE_EMBEDDING_MODEL,
        }),
      });

      if (!response.ok) {
        throw new Error(`Voyage embeddings request failed with ${response.status}`);
      }

      const payload = (await response.json()) as VoyageEmbeddingResponse;
      return (
        payload.data?.map((item) => {
          if (!Array.isArray(item.embedding)) {
            throw new Error("Voyage embeddings response did not include embeddings");
          }
          return item.embedding as number[];
        }) ?? []
      );
    },
  };
}
