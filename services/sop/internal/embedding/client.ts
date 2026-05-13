import { env } from "@/lib/env";

export const VOYAGE_EMBEDDING_MODEL = "voyage-3";
export const VOYAGE_EMBEDDING_DIMENSIONS = 1024;

export type VoyageEmbeddingInputType = "query" | "document";

export type VoyageEmbeddingClient = {
  embedTexts(
    input: string[],
    options: {
      inputType: VoyageEmbeddingInputType;
    },
  ): Promise<number[][]>;
};

type VoyageEmbeddingResponse = {
  data?: Array<{
    embedding?: unknown;
  }>;
};

const IS_TEST_ENV = process.env.NODE_ENV === "test";
const EMBEDDING_MAX_ATTEMPTS = IS_TEST_ENV ? 3 : 5;
const EMBEDDING_RETRY_BASE_DELAY_MS = IS_TEST_ENV ? 5 : 500;
const EMBEDDING_MAX_TEXTS_PER_REQUEST = 128;
const EMBEDDING_MAX_TOKENS_PER_REQUEST = 100_000;
const EMBEDDING_CONTEXT_LENGTH_TOKENS = 32_000;

export function createVoyageEmbeddingClient(): VoyageEmbeddingClient {
  return {
    async embedTexts(texts, options) {
      const embeddings: number[][] = [];

      for (const batch of createEmbeddingBatches(texts)) {
        const response = await fetchWithRetry(batch, options.inputType);

        if (!response.ok) {
          throw new Error(`Voyage embeddings request failed with ${response.status}`);
        }

        const payload = (await response.json()) as VoyageEmbeddingResponse;
        const batchEmbeddings = parseEmbeddings(payload, batch.length);
        embeddings.push(...batchEmbeddings);
      }

      return embeddings;
    },
  };
}

async function fetchWithRetry(
  texts: string[],
  inputType: VoyageEmbeddingInputType,
): Promise<Response> {
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
        input_type: inputType,
      }),
    });

    lastResponse = response;
    if (!isRetryableVoyageResponse(response) || attempt === EMBEDDING_MAX_ATTEMPTS) {
      return response;
    }

    await sleep(getRetryDelayMs(response, attempt));
  }

  return lastResponse!;
}

function createEmbeddingBatches(texts: string[]): string[][] {
  const batches: string[][] = [];
  let batch: string[] = [];
  let batchTokens = 0;

  for (const text of texts) {
    const textTokens = countApproximateTokens(text);
    if (textTokens > EMBEDDING_CONTEXT_LENGTH_TOKENS) {
      throw new Error(
        `SOP embedding input exceeds Voyage context length (${EMBEDDING_CONTEXT_LENGTH_TOKENS} tokens).`,
      );
    }

    const nextBatchWouldExceedLimits =
      batch.length >= EMBEDDING_MAX_TEXTS_PER_REQUEST ||
      batchTokens + textTokens > EMBEDDING_MAX_TOKENS_PER_REQUEST;

    if (batch.length > 0 && nextBatchWouldExceedLimits) {
      batches.push(batch);
      batch = [];
      batchTokens = 0;
    }

    batch.push(text);
    batchTokens += textTokens;
  }

  if (batch.length > 0) {
    batches.push(batch);
  }

  return batches;
}

function parseEmbeddings(
  payload: VoyageEmbeddingResponse,
  expectedCount: number,
): number[][] {
  const embeddings =
    payload.data?.map((item) => {
      if (!Array.isArray(item.embedding)) {
        throw new Error("Voyage embeddings response did not include embeddings");
      }

      if (item.embedding.length !== VOYAGE_EMBEDDING_DIMENSIONS) {
        throw new Error(
          `Voyage embeddings response used ${item.embedding.length} dimensions; expected ${VOYAGE_EMBEDDING_DIMENSIONS}.`,
        );
      }

      return item.embedding as number[];
    }) ?? [];

  if (embeddings.length !== expectedCount) {
    throw new Error("Voyage embeddings response did not match input count.");
  }

  return embeddings;
}

function isRetryableVoyageResponse(response: Response): boolean {
  return response.status === 429 || response.status >= 500;
}

function getRetryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers?.get?.("retry-after");
  if (retryAfter) {
    const retryAfterSeconds = Number(retryAfter);
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
      return retryAfterSeconds * 1000;
    }
  }

  return EMBEDDING_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
}

function countApproximateTokens(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
