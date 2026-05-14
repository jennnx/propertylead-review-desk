import { readFile } from "node:fs/promises";
import path from "node:path";

import { beforeEach, describe, expect, test, vi } from "vitest";

import { importWithRequiredEnv } from "@/tests/env";

const PDF_FIXTURE_PATH = path.join(
  __dirname,
  "internal",
  "__fixtures__",
  "sample.pdf",
);

const recordSopDocumentUpload = vi.fn();
const markSopDocumentFailed = vi.fn();
const replaceSopChunks = vi.fn();
const deleteSopDocumentRow = vi.fn();
const findSopDocumentById = vi.fn();
const listRecentSopDocuments = vi.fn();
const findMostSimilarSopChunks = vi.fn();
const enqueueQueueJobWithRetries = vi.fn();
const recordLlmCall = vi.fn();

vi.mock("./internal/mutations", () => ({
  recordSopDocumentUpload,
  markSopDocumentFailed,
  replaceSopChunks,
  deleteSopDocumentRow,
}));

vi.mock("./internal/queries", () => ({
  findSopDocumentById,
  listRecentSopDocuments,
  findMostSimilarSopChunks,
}));

vi.mock("@/services/queue", () => ({
  QUEUE_NAMES: {
    SOP_INGEST: "sop.ingest",
  },
  enqueueQueueJobWithRetries,
}));

vi.mock("@/services/llm-telemetry", () => ({
  recordLlmCall,
}));

function stubVoyageEmbedding(embedding: number[] = new Array(1024).fill(0.01)) {
  const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const body =
      typeof init?.body === "string"
        ? (JSON.parse(init.body) as { input?: string[] | string })
        : {};
    const input = Array.isArray(body.input)
      ? body.input
      : typeof body.input === "string"
        ? [body.input]
        : [];

    return {
      ok: true,
      json: async () => ({
        model: "voyage-3",
        usage: { total_tokens: input.length * 10 },
        data: input.map(() => ({
          embedding,
        })),
      }),
    };
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("SOP service", () => {
  beforeEach(() => {
    recordSopDocumentUpload.mockReset();
    markSopDocumentFailed.mockReset();
    replaceSopChunks.mockReset();
    deleteSopDocumentRow.mockReset();
    findSopDocumentById.mockReset();
    listRecentSopDocuments.mockReset();
    findMostSimilarSopChunks.mockReset();
    enqueueQueueJobWithRetries.mockReset();
    recordLlmCall.mockReset();
    recordLlmCall.mockResolvedValue(undefined);
  });

  test("exposes the flat public API stubs for SOP library and retrieval operations", async () => {
    const sop = await importWithRequiredEnv(() => import("./index"));

    expect(sop.uploadSopDocument).toEqual(expect.any(Function));
    expect(sop.listSopDocuments).toEqual(expect.any(Function));
    expect(sop.getSopDocument).toEqual(expect.any(Function));
    expect(sop.deleteSopDocument).toEqual(expect.any(Function));
    expect(sop.retrieveRelevantSopChunks).toEqual(expect.any(Function));
  });

  test("uploads a plain-text SOP Document by recording a PROCESSING row, storing bytes, and enqueueing one ingestion job", async () => {
    recordSopDocumentUpload.mockImplementation(async (input) => ({
      ...input,
      uploadedAt: new Date("2026-05-13T16:00:00.000Z"),
      processingStatus: "PROCESSING",
      failureMessage: null,
    }));
    const { uploadSopDocument } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    const document = await uploadSopDocument({
      originalFilename: "listing-follow-up.txt",
      contentType: "text/plain",
      byteSize: 24,
      body: Buffer.from("Call every hot lead twice"),
    });

    expect(recordSopDocumentUpload).toHaveBeenCalledWith({
      id: document.id,
      originalFilename: "listing-follow-up.txt",
      contentType: "text/plain",
      byteSize: 24,
      storagePath: document.storagePath,
    });
    expect(document).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        originalFilename: "listing-follow-up.txt",
        contentType: "text/plain",
        byteSize: 24,
        processingStatus: "PROCESSING",
        failureMessage: null,
        chunkCount: 0,
      }),
    );
    expect(document.storagePath).toBe(`${process.env.SOP_STORAGE_DIR}/${document.id}`);
    await expect(
      import("node:fs/promises").then((fs) => fs.readFile(document.storagePath, "utf8")),
    ).resolves.toBe("Call every hot lead twice");
    expect(enqueueQueueJobWithRetries).toHaveBeenCalledWith({
      queueName: "sop.ingest",
      jobName: "sop.ingest",
      data: {
        sopDocumentId: document.id,
      },
      jobOptions: {
        attempts: 1,
        jobId: `sop-ingest-${document.id}`,
      },
    });
  });

  test("rejects oversized SOP Document uploads before persistence or enqueue", async () => {
    const { uploadSopDocument } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    await expect(
      uploadSopDocument({
        originalFilename: "too-large.txt",
        contentType: "text/plain",
        byteSize: 10 * 1024 * 1024 + 1,
        body: Buffer.from("small body but reported too large"),
      }),
    ).rejects.toThrow(/10 MB or smaller/);

    expect(recordSopDocumentUpload).not.toHaveBeenCalled();
    expect(enqueueQueueJobWithRetries).not.toHaveBeenCalled();
  });

  test("uploads a Markdown SOP Document by recording a PROCESSING row, storing bytes, and enqueueing one ingestion job", async () => {
    recordSopDocumentUpload.mockImplementation(async (input) => ({
      ...input,
      uploadedAt: new Date("2026-05-13T16:00:00.000Z"),
      processingStatus: "PROCESSING",
      failureMessage: null,
    }));
    const { uploadSopDocument } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    const document = await uploadSopDocument({
      originalFilename: "seller-playbook.md",
      contentType: "text/markdown",
      byteSize: 32,
      body: Buffer.from("# Seller Playbook\n\nCall fast."),
    });

    expect(recordSopDocumentUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        originalFilename: "seller-playbook.md",
        contentType: "text/markdown",
      }),
    );
    expect(document.contentType).toBe("text/markdown");
    await expect(
      import("node:fs/promises").then((fs) => fs.readFile(document.storagePath, "utf8")),
    ).resolves.toBe("# Seller Playbook\n\nCall fast.");
    expect(enqueueQueueJobWithRetries).toHaveBeenCalledWith(
      expect.objectContaining({
        queueName: "sop.ingest",
        data: { sopDocumentId: document.id },
      }),
    );
  });

  test("uploads a PDF SOP Document by recording a PROCESSING row, storing bytes, and enqueueing one ingestion job", async () => {
    recordSopDocumentUpload.mockImplementation(async (input) => ({
      ...input,
      uploadedAt: new Date("2026-05-13T16:00:00.000Z"),
      processingStatus: "PROCESSING",
      failureMessage: null,
    }));
    const pdfBytes = await readFile(PDF_FIXTURE_PATH);
    const { uploadSopDocument } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    const document = await uploadSopDocument({
      originalFilename: "seller-playbook.pdf",
      contentType: "application/pdf",
      byteSize: pdfBytes.byteLength,
      body: pdfBytes,
    });

    expect(recordSopDocumentUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        originalFilename: "seller-playbook.pdf",
        contentType: "application/pdf",
        byteSize: pdfBytes.byteLength,
      }),
    );
    expect(document.contentType).toBe("application/pdf");
    await expect(
      import("node:fs/promises").then((fs) => fs.readFile(document.storagePath)),
    ).resolves.toEqual(pdfBytes);
    expect(enqueueQueueJobWithRetries).toHaveBeenCalledWith(
      expect.objectContaining({
        queueName: "sop.ingest",
        data: { sopDocumentId: document.id },
      }),
    );
  });

  test("rejects SOP Document uploads with unsupported content types before persistence or enqueue", async () => {
    const { uploadSopDocument } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    await expect(
      uploadSopDocument({
        originalFilename: "playbook.png",
        contentType: "image/png",
        byteSize: 11,
        body: Buffer.from("not a doc"),
      }),
    ).rejects.toThrow(/text\/plain.*text\/markdown.*application\/pdf/);

    expect(recordSopDocumentUpload).not.toHaveBeenCalled();
    expect(enqueueQueueJobWithRetries).not.toHaveBeenCalled();
  });

  test("rejects SOP Document uploads with unsupported filename extensions before persistence or enqueue", async () => {
    const { uploadSopDocument } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    await expect(
      uploadSopDocument({
        originalFilename: "playbook.docx",
        contentType: "text/plain",
        byteSize: 11,
        body: Buffer.from("docx"),
      }),
    ).rejects.toThrow(/\.txt.*\.md.*\.pdf/);

    expect(recordSopDocumentUpload).not.toHaveBeenCalled();
    expect(enqueueQueueJobWithRetries).not.toHaveBeenCalled();
  });

  test("marks an SOP Document FAILED and removes stored bytes when enqueue fails after upload persistence", async () => {
    recordSopDocumentUpload.mockImplementation(async (input) => ({
      ...input,
      uploadedAt: new Date("2026-05-13T16:00:00.000Z"),
      processingStatus: "PROCESSING",
      failureMessage: null,
    }));
    enqueueQueueJobWithRetries.mockRejectedValue(new Error("redis unavailable"));
    const { uploadSopDocument } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    const upload = uploadSopDocument({
      originalFilename: "listing-follow-up.txt",
      contentType: "text/plain",
      byteSize: 24,
      body: Buffer.from("Call every hot lead twice"),
    });

    await expect(upload).rejects.toThrow("redis unavailable");
    const documentId = recordSopDocumentUpload.mock.calls[0][0].id;
    const storagePath = `${process.env.SOP_STORAGE_DIR}/${documentId}`;
    expect(markSopDocumentFailed).toHaveBeenCalledWith(documentId, "redis unavailable");
    await expect(
      import("node:fs/promises").then((fs) => fs.access(storagePath)),
    ).rejects.toThrow();
  });

  test("lists recent SOP Documents with processing status and chunk counts", async () => {
    listRecentSopDocuments.mockResolvedValue([
      {
        id: "doc-ready",
        originalFilename: "buyer-playbook.txt",
        contentType: "text/plain",
        byteSize: 2048,
        uploadedAt: new Date("2026-05-13T15:00:00.000Z"),
        processingStatus: "READY",
        failureMessage: null,
        chunkCount: 3,
      },
      {
        id: "doc-failed",
        originalFilename: "empty.txt",
        contentType: "text/plain",
        byteSize: 0,
        uploadedAt: new Date("2026-05-13T14:00:00.000Z"),
        processingStatus: "FAILED",
        failureMessage: "SOP Document did not contain any text.",
        chunkCount: 0,
      },
    ]);
    const { listSopDocuments } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    await expect(listSopDocuments()).resolves.toEqual([
      {
        id: "doc-ready",
        originalFilename: "buyer-playbook.txt",
        contentType: "text/plain",
        byteSize: 2048,
        uploadedAt: new Date("2026-05-13T15:00:00.000Z"),
        processingStatus: "READY",
        failureMessage: null,
        chunkCount: 3,
      },
      {
        id: "doc-failed",
        originalFilename: "empty.txt",
        contentType: "text/plain",
        byteSize: 0,
        uploadedAt: new Date("2026-05-13T14:00:00.000Z"),
        processingStatus: "FAILED",
        failureMessage: "SOP Document did not contain any text.",
        chunkCount: 0,
      },
    ]);
    expect(listRecentSopDocuments).toHaveBeenCalledWith(50);
  });

  test("processes a stored TXT SOP Document into READY chunks", async () => {
    const storageDir = "/tmp/propertylead-review-desk/sops";
    const storagePath = `${storageDir}/doc-success`;
    await import("node:fs/promises").then(async (fs) => {
      await fs.mkdir(storageDir, { recursive: true });
      await fs.writeFile(
        storagePath,
        "Call hot seller leads within five minutes.\n\nFollow up twice the first day.",
      );
    });
    findSopDocumentById.mockResolvedValue({
      id: "doc-success",
      originalFilename: "seller-playbook.txt",
      contentType: "text/plain",
      byteSize: 73,
      storagePath,
      uploadedAt: new Date("2026-05-13T15:00:00.000Z"),
      processingStatus: "PROCESSING",
      failureMessage: null,
    });
    replaceSopChunks.mockResolvedValue(undefined);
    const fetch = stubVoyageEmbedding(new Array(1024).fill(0.02));
    const { processSopIngestionJob } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    await expect(
      processSopIngestionJob({ sopDocumentId: "doc-success" }),
    ).resolves.toBeUndefined();

    expect(fetch).toHaveBeenCalledWith(
      "https://api.voyageai.com/v1/embeddings",
      expect.objectContaining({
        body: JSON.stringify({
          input: [
            "Call hot seller leads within five minutes.\n\nFollow up twice the first day.",
          ],
          model: "voyage-3",
          input_type: "document",
        }),
      }),
    );
    expect(replaceSopChunks).toHaveBeenCalledWith("doc-success", [
      {
        ordinal: 0,
        text: "Call hot seller leads within five minutes.\n\nFollow up twice the first day.",
        embedding: new Array(1024).fill(0.02),
      },
    ]);
    expect(recordLlmCall).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "voyage",
        requestedModelAlias: "voyage-3",
        responseModelSnapshot: "voyage-3",
        usage: { totalTokens: 10 },
        status: "ok",
        context: { sopDocumentId: "doc-success" },
      }),
    );
    expect(markSopDocumentFailed).not.toHaveBeenCalled();
  });

  test("marks the SOP Document FAILED when TXT parsing produces no text", async () => {
    const storageDir = "/tmp/propertylead-review-desk/sops";
    const storagePath = `${storageDir}/doc-empty`;
    await import("node:fs/promises").then(async (fs) => {
      await fs.mkdir(storageDir, { recursive: true });
      await fs.writeFile(storagePath, "  \n\n  ");
    });
    findSopDocumentById.mockResolvedValue({
      id: "doc-empty",
      originalFilename: "empty.txt",
      contentType: "text/plain",
      byteSize: 6,
      storagePath,
      uploadedAt: new Date("2026-05-13T15:00:00.000Z"),
      processingStatus: "PROCESSING",
      failureMessage: null,
    });
    const fetch = stubVoyageEmbedding();
    const { processSopIngestionJob } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    await expect(
      processSopIngestionJob({ sopDocumentId: "doc-empty" }),
    ).rejects.toThrow("SOP Document did not contain any text.");

    expect(fetch).not.toHaveBeenCalled();
    expect(replaceSopChunks).not.toHaveBeenCalled();
    expect(markSopDocumentFailed).toHaveBeenCalledWith(
      "doc-empty",
      "SOP Document did not contain any text.",
    );
  });

  test("processes a stored PDF SOP Document into READY chunks using the unpdf parsing seam", async () => {
    const storageDir = "/tmp/propertylead-review-desk/sops";
    const storagePath = `${storageDir}/doc-pdf-success`;
    const fixtureBytes = await readFile(PDF_FIXTURE_PATH);
    await import("node:fs/promises").then(async (fs) => {
      await fs.mkdir(storageDir, { recursive: true });
      await fs.writeFile(storagePath, fixtureBytes);
    });
    findSopDocumentById.mockResolvedValue({
      id: "doc-pdf-success",
      originalFilename: "seller-playbook.pdf",
      contentType: "application/pdf",
      byteSize: fixtureBytes.byteLength,
      storagePath,
      uploadedAt: new Date("2026-05-13T15:00:00.000Z"),
      processingStatus: "PROCESSING",
      failureMessage: null,
    });
    replaceSopChunks.mockResolvedValue(undefined);
    stubVoyageEmbedding(new Array(1024).fill(0.03));
    const { processSopIngestionJob } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    await expect(
      processSopIngestionJob({ sopDocumentId: "doc-pdf-success" }),
    ).resolves.toBeUndefined();

    expect(replaceSopChunks).toHaveBeenCalledWith(
      "doc-pdf-success",
      expect.arrayContaining([
        expect.objectContaining({
          ordinal: expect.any(Number),
          text: expect.any(String),
          embedding: new Array(1024).fill(0.03),
        }),
      ]),
    );
    expect(markSopDocumentFailed).not.toHaveBeenCalled();
  });

  test("marks the SOP Document FAILED with a descriptive message when the PDF cannot be parsed", async () => {
    const storageDir = "/tmp/propertylead-review-desk/sops";
    const storagePath = `${storageDir}/doc-pdf-corrupt`;
    await import("node:fs/promises").then(async (fs) => {
      await fs.mkdir(storageDir, { recursive: true });
      await fs.writeFile(storagePath, "this is not actually a pdf file");
    });
    findSopDocumentById.mockResolvedValue({
      id: "doc-pdf-corrupt",
      originalFilename: "corrupt.pdf",
      contentType: "application/pdf",
      byteSize: 32,
      storagePath,
      uploadedAt: new Date("2026-05-13T15:00:00.000Z"),
      processingStatus: "PROCESSING",
      failureMessage: null,
    });
    const fetch = stubVoyageEmbedding();
    const { processSopIngestionJob } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    await expect(
      processSopIngestionJob({ sopDocumentId: "doc-pdf-corrupt" }),
    ).rejects.toThrow(/SOP Document PDF could not be parsed/);

    expect(fetch).not.toHaveBeenCalled();
    expect(replaceSopChunks).not.toHaveBeenCalled();
    expect(markSopDocumentFailed).toHaveBeenCalledWith(
      "doc-pdf-corrupt",
      expect.stringMatching(/SOP Document PDF could not be parsed/),
    );
  });

  test("retries retryable Voyage embedding failures before marking the SOP Document FAILED", async () => {
    const storageDir = "/tmp/propertylead-review-desk/sops";
    const storagePath = `${storageDir}/doc-embedding-failure`;
    await import("node:fs/promises").then(async (fs) => {
      await fs.mkdir(storageDir, { recursive: true });
      await fs.writeFile(storagePath, "Call every new lead within five minutes.");
    });
    findSopDocumentById.mockResolvedValue({
      id: "doc-embedding-failure",
      originalFilename: "seller-playbook.txt",
      contentType: "text/plain",
      byteSize: 40,
      storagePath,
      uploadedAt: new Date("2026-05-13T15:00:00.000Z"),
      processingStatus: "PROCESSING",
      failureMessage: null,
    });
    const fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetch);
    const { processSopIngestionJob } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    await expect(
      processSopIngestionJob({ sopDocumentId: "doc-embedding-failure" }),
    ).rejects.toThrow("Voyage embeddings request failed with 503");

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(replaceSopChunks).not.toHaveBeenCalled();
    expect(markSopDocumentFailed).toHaveBeenCalledWith(
      "doc-embedding-failure",
      "Voyage embeddings request failed with 503",
    );
  });

  describe("deleteSopDocument", () => {
    test("removes the SOP Document row and its stored file bytes, relying on the schema cascade for chunks", async () => {
      const storageDir = "/tmp/propertylead-review-desk/sops";
      const storagePath = `${storageDir}/doc-ready-delete`;
      await import("node:fs/promises").then(async (fs) => {
        await fs.mkdir(storageDir, { recursive: true });
        await fs.writeFile(storagePath, "Call hot seller leads within five minutes.");
      });
      deleteSopDocumentRow.mockResolvedValue({ storagePath });
      const { deleteSopDocument } = await importWithRequiredEnv(() =>
        import("./index"),
      );

      await expect(deleteSopDocument("doc-ready-delete")).resolves.toBeUndefined();

      expect(deleteSopDocumentRow).toHaveBeenCalledWith("doc-ready-delete");
      await expect(
        import("node:fs/promises").then((fs) => fs.access(storagePath)),
      ).rejects.toThrow();
    });

    test("is a clear no-op when the SOP Document id does not exist (chosen behavior)", async () => {
      deleteSopDocumentRow.mockResolvedValue(null);
      const { deleteSopDocument } = await importWithRequiredEnv(() =>
        import("./index"),
      );

      await expect(
        deleteSopDocument("does-not-exist"),
      ).resolves.toBeUndefined();

      expect(deleteSopDocumentRow).toHaveBeenCalledWith("does-not-exist");
    });

    test("tolerates an already-missing stored file (ENOENT) after the row delete succeeds", async () => {
      const storagePath =
        "/tmp/propertylead-review-desk/sops/doc-missing-file-delete";
      deleteSopDocumentRow.mockResolvedValue({ storagePath });
      const { deleteSopDocument } = await importWithRequiredEnv(() =>
        import("./index"),
      );

      await expect(
        deleteSopDocument("doc-missing-file-delete"),
      ).resolves.toBeUndefined();
    });

    test("propagates unexpected errors from the row delete without touching storage", async () => {
      deleteSopDocumentRow.mockRejectedValue(new Error("connection refused"));
      const { deleteSopDocument } = await importWithRequiredEnv(() =>
        import("./index"),
      );

      await expect(deleteSopDocument("doc-error")).rejects.toThrow(
        "connection refused",
      );
    });
  });

  describe("retrieveRelevantSopChunks", () => {
    test("returns top-k SOP Chunks in the order the database returned them, embedding the query via the Voyage REST API with VOYAGE_API_KEY and voyage-3", async () => {
      findMostSimilarSopChunks.mockResolvedValue([
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
            input_type: "query",
          }),
        },
      );
      expect(findMostSimilarSopChunks).toHaveBeenCalledWith(expect.any(Array), 2);
    });

    test("returns an empty array when the SOP library has no matching chunks", async () => {
      findMostSimilarSopChunks.mockResolvedValue([]);
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
      expect(findMostSimilarSopChunks).not.toHaveBeenCalled();
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
        expect(findMostSimilarSopChunks).not.toHaveBeenCalled();
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
      expect(findMostSimilarSopChunks).not.toHaveBeenCalled();
    });
  });
});
