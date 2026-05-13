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

const EMBEDDING_MAX_ATTEMPTS = 3;
const EMBEDDING_RETRY_BASE_DELAY_MS = 5;

export function createVoyageEmbeddingClient(): VoyageEmbeddingClient {
  return {
    async embedTexts(texts) {
      const response = await fetchWithRetry(texts);

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

async function fetchWithRetry(texts: string[]): Promise<Response> {
  let lastResponse: Response | undefined;

  for (let attempt = 1; attempt <= EMBEDDING_MAX_ATTEMPTS; attempt++) {
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

    lastResponse = response;
    if (!isRetryableVoyageResponse(response) || attempt === EMBEDDING_MAX_ATTEMPTS) {
      return response;
    }

    await sleep(EMBEDDING_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
  }

  return lastResponse!;
}

function isRetryableVoyageResponse(response: Response): boolean {
  return response.status === 429 || response.status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
