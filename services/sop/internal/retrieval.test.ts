import { beforeEach, describe, expect, test, vi } from "vitest";

import { importWithRequiredEnv } from "@/tests/env";

const queryRaw = vi.fn();

vi.mock("@/services/database", () => ({
  getPrismaClient: () => ({
    $queryRaw: queryRaw,
  }),
}));

function stubVoyageEmbedding(embedding: number[] = new Array(1024).fill(0.01)) {
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: [{ embedding }] }),
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("retrieveRelevantSopChunks", () => {
  beforeEach(() => {
    queryRaw.mockReset();
  });

  test("returns top-k SOP Chunks in the order the database returned them", async () => {
    queryRaw.mockResolvedValue([
      {
        id: "chunk-1",
        sopDocumentId: "doc-1",
        ordinal: 0,
        text: "first chunk text",
      },
      {
        id: "chunk-2",
        sopDocumentId: "doc-1",
        ordinal: 1,
        text: "second chunk text",
      },
    ]);
    stubVoyageEmbedding();

    const { retrieveRelevantSopChunks } = await importWithRequiredEnv(() =>
      import("./retrieval"),
    );

    await expect(
      retrieveRelevantSopChunks("pricing objection", 2),
    ).resolves.toEqual([
      {
        id: "chunk-1",
        sopDocumentId: "doc-1",
        ordinal: 0,
        text: "first chunk text",
      },
      {
        id: "chunk-2",
        sopDocumentId: "doc-1",
        ordinal: 1,
        text: "second chunk text",
      },
    ]);
  });

  test("returns an empty array when the SOP library has no matching chunks", async () => {
    queryRaw.mockResolvedValue([]);
    stubVoyageEmbedding();

    const { retrieveRelevantSopChunks } = await importWithRequiredEnv(() =>
      import("./retrieval"),
    );

    await expect(
      retrieveRelevantSopChunks("pricing objection", 5),
    ).resolves.toEqual([]);
  });

  test("rejects empty or whitespace-only queries before any embedding or database call", async () => {
    const fetch = stubVoyageEmbedding();
    const { retrieveRelevantSopChunks } = await importWithRequiredEnv(() =>
      import("./retrieval"),
    );

    for (const query of ["", "   ", "\n\t  "]) {
      await expect(retrieveRelevantSopChunks(query, 3)).rejects.toThrow();
    }

    expect(fetch).not.toHaveBeenCalled();
    expect(queryRaw).not.toHaveBeenCalled();
  });

  test.each([
    ["zero", 0],
    ["negative", -1],
    ["non-integer", 1.5],
    ["above the upper bound", 101],
  ])(
    "rejects k that is %s before any embedding or database call",
    async (_label, k) => {
      const fetch = stubVoyageEmbedding();
      const { retrieveRelevantSopChunks } = await importWithRequiredEnv(() =>
        import("./retrieval"),
      );

      await expect(retrieveRelevantSopChunks("pricing objection", k)).rejects.toThrow();
      expect(fetch).not.toHaveBeenCalled();
      expect(queryRaw).not.toHaveBeenCalled();
    },
  );
});
