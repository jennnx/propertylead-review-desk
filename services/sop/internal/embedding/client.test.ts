import { describe, expect, test, vi } from "vitest";

import { importWithRequiredEnv } from "@/tests/env";

describe("Voyage embedding client", () => {
  test("constructs from VOYAGE_API_KEY and pins the Voyage model contract", async () => {
    const {
      VOYAGE_EMBEDDING_DIMENSIONS,
      VOYAGE_EMBEDDING_MODEL,
      createVoyageEmbeddingClient,
    } = await importWithRequiredEnv(() => import("./client"));

    const client = createVoyageEmbeddingClient();

    expect(client.embedTexts).toEqual(expect.any(Function));
    expect(VOYAGE_EMBEDDING_MODEL).toBe("voyage-3");
    expect(VOYAGE_EMBEDDING_DIMENSIONS).toBe(1024);
  });

  test("sends embeddings requests directly to the Voyage REST API", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            embedding: [0.1, 0.2, 0.3],
          },
        ],
      }),
    });
    const { createVoyageEmbeddingClient } = await importWithRequiredEnv(() =>
      import("./client"),
      {
        VOYAGE_API_KEY: "voyage-test-key",
      },
    );
    vi.stubGlobal("fetch", fetch);
    const client = createVoyageEmbeddingClient();

    await expect(client.embedTexts(["hello"])).resolves.toEqual([
      [0.1, 0.2, 0.3],
    ]);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.voyageai.com/v1/embeddings",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer voyage-test-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: ["hello"],
          model: "voyage-3",
        }),
      },
    );
  });
});
