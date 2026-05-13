import { describe, expect, test, vi } from "vitest";

import { importWithRequiredEnv } from "@/tests/env";

describe("Voyage embedding client", () => {
  test("batches document embedding requests while preserving output order", async () => {
    const embedding = new Array(1024).fill(0.01);
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body =
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as { input: string[]; input_type: string })
          : { input: [], input_type: "" };

      return {
        ok: true,
        json: async () => ({
          data: body.input.map((text) => ({
            embedding: embedding.map((value) => value + Number(text.slice(4)) / 1000),
          })),
        }),
      };
    });
    vi.stubGlobal("fetch", fetch);

    const { createVoyageEmbeddingClient } = await importWithRequiredEnv(() =>
      import("./client"),
    );

    const texts = Array.from({ length: 129 }, (_, index) => `doc-${index}`);
    const embeddings = await createVoyageEmbeddingClient().embedTexts(texts, {
      inputType: "document",
    });

    expect(embeddings).toHaveLength(129);
    expect(embeddings[0]?.[0]).toBe(0.01);
    expect(embeddings[128]?.[0]).toBe(0.138);
    expect(fetch).toHaveBeenCalledTimes(2);

    const firstBody = JSON.parse(
      fetch.mock.calls[0]?.[1]?.body as string,
    ) as { input: string[]; input_type: string; model: string };
    const secondBody = JSON.parse(
      fetch.mock.calls[1]?.[1]?.body as string,
    ) as { input: string[]; input_type: string; model: string };

    expect(firstBody).toMatchObject({
      model: "voyage-3",
      input_type: "document",
    });
    expect(firstBody.input).toHaveLength(128);
    expect(secondBody).toMatchObject({
      model: "voyage-3",
      input_type: "document",
      input: ["doc-128"],
    });
  });
});
