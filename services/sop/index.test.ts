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

describe("SOP service", () => {
  beforeEach(() => {
    queryRaw.mockReset();
  });

  test("exposes the flat public API stubs for SOP library and retrieval operations", async () => {
    const sop = await importWithRequiredEnv(() => import("./index"));

    expect(sop.uploadSopDocument).toEqual(expect.any(Function));
    expect(sop.listSopDocuments).toEqual(expect.any(Function));
    expect(sop.getSopDocument).toEqual(expect.any(Function));
    expect(sop.deleteSopDocument).toEqual(expect.any(Function));
    expect(sop.retrieveRelevantSopChunks).toEqual(expect.any(Function));
  });

  // TODO: Delete when the SOP operation implementation slices replace these stubs.
  test("keeps SOP library operations unavailable until their implementation slices land", async () => {
    const {
      deleteSopDocument,
      getSopDocument,
      listSopDocuments,
      uploadSopDocument,
    } = await importWithRequiredEnv(() => import("./index"));

    await expect(
      uploadSopDocument({
        originalFilename: "playbook.txt",
        contentType: "text/plain",
        byteSize: 7,
        body: Buffer.from("playbook"),
      }),
    ).rejects.toThrow("not implemented");
    await expect(listSopDocuments()).rejects.toThrow("not implemented");
    await expect(getSopDocument("sop-doc-1")).rejects.toThrow("not implemented");
    await expect(deleteSopDocument("sop-doc-1")).rejects.toThrow(
      "not implemented",
    );
  });

  describe("retrieveRelevantSopChunks", () => {
    test("returns top-k SOP Chunks in the order the database returned them, embedding the query via the Voyage REST API with VOYAGE_API_KEY and voyage-3", async () => {
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
      const fetch = stubVoyageEmbedding();

      const { retrieveRelevantSopChunks } = await importWithRequiredEnv(
        () => import("./index"),
        {
          VOYAGE_API_KEY: "voyage-test-key",
        },
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

      expect(fetch).toHaveBeenCalledWith(
        "https://api.voyageai.com/v1/embeddings",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer voyage-test-key",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            input: ["pricing objection"],
            model: "voyage-3",
          }),
        },
      );
    });

    test("returns an empty array when the SOP library has no matching chunks", async () => {
      queryRaw.mockResolvedValue([]);
      stubVoyageEmbedding();

      const { retrieveRelevantSopChunks } = await importWithRequiredEnv(() =>
        import("./index"),
      );

      await expect(
        retrieveRelevantSopChunks("pricing objection", 5),
      ).resolves.toEqual([]);
    });

    test("rejects empty or whitespace-only queries before any embedding or database call", async () => {
      const fetch = stubVoyageEmbedding();
      const { retrieveRelevantSopChunks } = await importWithRequiredEnv(() =>
        import("./index"),
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
          import("./index"),
        );

        await expect(
          retrieveRelevantSopChunks("pricing objection", k),
        ).rejects.toThrow();
        expect(fetch).not.toHaveBeenCalled();
        expect(queryRaw).not.toHaveBeenCalled();
      },
    );

    test("surfaces a clear error when the Voyage embeddings endpoint responds with a non-OK status", async () => {
      const fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({}),
      });
      vi.stubGlobal("fetch", fetch);
      const { retrieveRelevantSopChunks } = await importWithRequiredEnv(() =>
        import("./index"),
      );

      await expect(
        retrieveRelevantSopChunks("pricing objection", 3),
      ).rejects.toThrow(/Voyage embeddings request failed with 503/);
      expect(queryRaw).not.toHaveBeenCalled();
    });
  });
});
