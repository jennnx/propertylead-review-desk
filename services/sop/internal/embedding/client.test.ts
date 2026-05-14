import { beforeEach, describe, expect, test, vi } from "vitest";

import { importWithRequiredEnv } from "@/tests/env";

const recordLlmCall = vi.fn();

vi.mock("@/services/llm-telemetry", () => ({
  recordLlmCall,
}));

describe("Voyage embedding client", () => {
  beforeEach(() => {
    recordLlmCall.mockReset();
    recordLlmCall.mockResolvedValue(undefined);
  });

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
          model: "voyage-3",
          usage: { total_tokens: body.input.length * 11 },
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
      telemetryContext: { sopDocumentId: "doc-telemetry" },
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

    expect(recordLlmCall).toHaveBeenCalledTimes(2);
    expect(recordLlmCall).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        provider: "voyage",
        requestedModelAlias: "voyage-3",
        responseModelSnapshot: "voyage-3",
        usage: { totalTokens: 1408 },
        source: "production",
        status: "ok",
        context: { sopDocumentId: "doc-telemetry" },
      }),
    );
    expect(recordLlmCall).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        provider: "voyage",
        requestedModelAlias: "voyage-3",
        responseModelSnapshot: "voyage-3",
        usage: { totalTokens: 11 },
        status: "ok",
        context: { sopDocumentId: "doc-telemetry" },
      }),
    );
  });

  test("records a telemetry row on a transport error and rethrows", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValue(new Error("Voyage API connection refused"));
    vi.stubGlobal("fetch", fetch);

    const { createVoyageEmbeddingClient } = await importWithRequiredEnv(() =>
      import("./client"),
    );

    await expect(
      createVoyageEmbeddingClient().embedTexts(["Call every lead quickly."], {
        inputType: "document",
        telemetryContext: { sopDocumentId: "doc-error" },
      }),
    ).rejects.toThrow("Voyage API connection refused");

    expect(recordLlmCall).toHaveBeenCalledTimes(1);
    expect(recordLlmCall).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "voyage",
        requestedModelAlias: "voyage-3",
        responseModelSnapshot: null,
        usage: { totalTokens: 0 },
        status: "error",
        errorMessage: "Voyage API connection refused",
        context: { sopDocumentId: "doc-error" },
      }),
    );
  });
});
