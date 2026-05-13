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

const sopDocumentCreate = vi.fn();
const sopDocumentFindMany = vi.fn();
const sopDocumentFindUnique = vi.fn();
const sopDocumentUpdate = vi.fn();
const sopChunkDeleteMany = vi.fn();
const queryRaw = vi.fn();
const executeRaw = vi.fn();
const transaction = vi.fn();
const enqueueQueueJobWithRetries = vi.fn();

vi.mock("@/services/database", () => ({
  getPrismaClient: () => ({
    sopDocument: {
      create: sopDocumentCreate,
      findMany: sopDocumentFindMany,
      findUnique: sopDocumentFindUnique,
      update: sopDocumentUpdate,
    },
    sopChunk: {
      deleteMany: sopChunkDeleteMany,
    },
    $queryRaw: queryRaw,
    $executeRaw: executeRaw,
    $transaction: transaction,
  }),
}));

vi.mock("@/services/queue", () => ({
  QUEUE_NAMES: {
    SOP_INGEST: "sop.ingest",
  },
  enqueueQueueJobWithRetries,
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
    sopDocumentCreate.mockReset();
    sopDocumentFindMany.mockReset();
    sopDocumentFindUnique.mockReset();
    sopDocumentUpdate.mockReset();
    sopChunkDeleteMany.mockReset();
    queryRaw.mockReset();
    executeRaw.mockReset();
    transaction.mockReset();
    transaction.mockImplementation((callback) =>
      callback({
        sopDocument: {
          update: sopDocumentUpdate,
        },
        sopChunk: {
          deleteMany: sopChunkDeleteMany,
        },
        $executeRaw: executeRaw,
      }),
    );
    enqueueQueueJobWithRetries.mockReset();
  });

  test("exposes the flat public API stubs for SOP library and retrieval operations", async () => {
    const sop = await importWithRequiredEnv(() => import("./index"));

    expect(sop.uploadSopDocument).toEqual(expect.any(Function));
    expect(sop.listSopDocuments).toEqual(expect.any(Function));
    expect(sop.getSopDocument).toEqual(expect.any(Function));
    expect(sop.deleteSopDocument).toEqual(expect.any(Function));
    expect(sop.retrieveRelevantSopChunks).toEqual(expect.any(Function));
  });

  test("uploads a plain-text SOP Document by creating a PROCESSING row, storing bytes, and enqueueing one ingestion job", async () => {
    sopDocumentCreate.mockImplementation(async ({ data }) => ({
      ...data,
      uploadedAt: new Date("2026-05-13T16:00:00.000Z"),
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

    expect(sopDocumentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        originalFilename: "listing-follow-up.txt",
        contentType: "text/plain",
        byteSize: 24,
        processingStatus: "PROCESSING",
        failureMessage: null,
      }),
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

    expect(sopDocumentCreate).not.toHaveBeenCalled();
    expect(enqueueQueueJobWithRetries).not.toHaveBeenCalled();
  });

  test("uploads a Markdown SOP Document by creating a PROCESSING row, storing bytes, and enqueueing one ingestion job", async () => {
    sopDocumentCreate.mockImplementation(async ({ data }) => ({
      ...data,
      uploadedAt: new Date("2026-05-13T16:00:00.000Z"),
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

    expect(sopDocumentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        originalFilename: "seller-playbook.md",
        contentType: "text/markdown",
        processingStatus: "PROCESSING",
        failureMessage: null,
      }),
    });
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

  test("uploads a PDF SOP Document by creating a PROCESSING row, storing bytes, and enqueueing one ingestion job", async () => {
    sopDocumentCreate.mockImplementation(async ({ data }) => ({
      ...data,
      uploadedAt: new Date("2026-05-13T16:00:00.000Z"),
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

    expect(sopDocumentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        originalFilename: "seller-playbook.pdf",
        contentType: "application/pdf",
        byteSize: pdfBytes.byteLength,
        processingStatus: "PROCESSING",
        failureMessage: null,
      }),
    });
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

    expect(sopDocumentCreate).not.toHaveBeenCalled();
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

    expect(sopDocumentCreate).not.toHaveBeenCalled();
    expect(enqueueQueueJobWithRetries).not.toHaveBeenCalled();
  });

  test("marks an SOP Document FAILED and removes stored bytes when enqueue fails after upload persistence", async () => {
    sopDocumentCreate.mockImplementation(async ({ data }) => ({
      ...data,
      uploadedAt: new Date("2026-05-13T16:00:00.000Z"),
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
    const documentId = sopDocumentCreate.mock.calls[0][0].data.id;
    const storagePath = `${process.env.SOP_STORAGE_DIR}/${documentId}`;
    expect(sopDocumentUpdate).toHaveBeenCalledWith({
      where: {
        id: documentId,
      },
      data: {
        processingStatus: "FAILED",
        failureMessage: "redis unavailable",
      },
    });
    await expect(
      import("node:fs/promises").then((fs) => fs.access(storagePath)),
    ).rejects.toThrow();
  });

  test("lists recent SOP Documents with processing status and chunk counts", async () => {
    sopDocumentFindMany.mockResolvedValue([
      {
        id: "doc-ready",
        originalFilename: "buyer-playbook.txt",
        contentType: "text/plain",
        byteSize: 2048,
        storagePath: "/tmp/sops/doc-ready",
        uploadedAt: new Date("2026-05-13T15:00:00.000Z"),
        processingStatus: "READY",
        failureMessage: null,
        _count: {
          chunks: 3,
        },
      },
      {
        id: "doc-failed",
        originalFilename: "empty.txt",
        contentType: "text/plain",
        byteSize: 0,
        storagePath: "/tmp/sops/doc-failed",
        uploadedAt: new Date("2026-05-13T14:00:00.000Z"),
        processingStatus: "FAILED",
        failureMessage: "SOP Document did not contain any text.",
        _count: {
          chunks: 0,
        },
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
    expect(sopDocumentFindMany).toHaveBeenCalledWith({
      orderBy: {
        uploadedAt: "desc",
      },
      take: 50,
      include: {
        _count: {
          select: {
            chunks: true,
          },
        },
      },
    });
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
    sopDocumentFindUnique.mockResolvedValue({
      id: "doc-success",
      originalFilename: "seller-playbook.txt",
      contentType: "text/plain",
      byteSize: 73,
      storagePath,
      uploadedAt: new Date("2026-05-13T15:00:00.000Z"),
      processingStatus: "PROCESSING",
      failureMessage: null,
    });
    sopDocumentUpdate.mockResolvedValue({});
    executeRaw.mockResolvedValue(1);
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
    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(sopChunkDeleteMany).toHaveBeenCalledWith({
      where: {
        sopDocumentId: "doc-success",
      },
    });
    expect(sopDocumentUpdate).toHaveBeenCalledWith({
      where: {
        id: "doc-success",
      },
      data: {
        processingStatus: "READY",
        failureMessage: null,
      },
    });
  });

  test("marks the SOP Document FAILED when TXT parsing produces no text", async () => {
    const storageDir = "/tmp/propertylead-review-desk/sops";
    const storagePath = `${storageDir}/doc-empty`;
    await import("node:fs/promises").then(async (fs) => {
      await fs.mkdir(storageDir, { recursive: true });
      await fs.writeFile(storagePath, "  \n\n  ");
    });
    sopDocumentFindUnique.mockResolvedValue({
      id: "doc-empty",
      originalFilename: "empty.txt",
      contentType: "text/plain",
      byteSize: 6,
      storagePath,
      uploadedAt: new Date("2026-05-13T15:00:00.000Z"),
      processingStatus: "PROCESSING",
      failureMessage: null,
    });
    sopDocumentUpdate.mockResolvedValue({});
    const fetch = stubVoyageEmbedding();
    const { processSopIngestionJob } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    await expect(
      processSopIngestionJob({ sopDocumentId: "doc-empty" }),
    ).rejects.toThrow("SOP Document did not contain any text.");

    expect(fetch).not.toHaveBeenCalled();
    expect(executeRaw).not.toHaveBeenCalled();
    expect(sopDocumentUpdate).toHaveBeenCalledWith({
      where: {
        id: "doc-empty",
      },
      data: {
        processingStatus: "FAILED",
        failureMessage: "SOP Document did not contain any text.",
      },
    });
  });

  test("processes a stored PDF SOP Document into READY chunks using the unpdf parsing seam", async () => {
    const storageDir = "/tmp/propertylead-review-desk/sops";
    const storagePath = `${storageDir}/doc-pdf-success`;
    const fixtureBytes = await readFile(PDF_FIXTURE_PATH);
    await import("node:fs/promises").then(async (fs) => {
      await fs.mkdir(storageDir, { recursive: true });
      await fs.writeFile(storagePath, fixtureBytes);
    });
    sopDocumentFindUnique.mockResolvedValue({
      id: "doc-pdf-success",
      originalFilename: "seller-playbook.pdf",
      contentType: "application/pdf",
      byteSize: fixtureBytes.byteLength,
      storagePath,
      uploadedAt: new Date("2026-05-13T15:00:00.000Z"),
      processingStatus: "PROCESSING",
      failureMessage: null,
    });
    sopDocumentUpdate.mockResolvedValue({});
    executeRaw.mockResolvedValue(1);
    stubVoyageEmbedding(new Array(1024).fill(0.03));
    const { processSopIngestionJob } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    await expect(
      processSopIngestionJob({ sopDocumentId: "doc-pdf-success" }),
    ).resolves.toBeUndefined();

    expect(executeRaw).toHaveBeenCalled();
    expect(sopChunkDeleteMany).toHaveBeenCalledWith({
      where: { sopDocumentId: "doc-pdf-success" },
    });
    expect(sopDocumentUpdate).toHaveBeenCalledWith({
      where: { id: "doc-pdf-success" },
      data: {
        processingStatus: "READY",
        failureMessage: null,
      },
    });
  });

  test("marks the SOP Document FAILED with a descriptive message when the PDF cannot be parsed", async () => {
    const storageDir = "/tmp/propertylead-review-desk/sops";
    const storagePath = `${storageDir}/doc-pdf-corrupt`;
    await import("node:fs/promises").then(async (fs) => {
      await fs.mkdir(storageDir, { recursive: true });
      await fs.writeFile(storagePath, "this is not actually a pdf file");
    });
    sopDocumentFindUnique.mockResolvedValue({
      id: "doc-pdf-corrupt",
      originalFilename: "corrupt.pdf",
      contentType: "application/pdf",
      byteSize: 32,
      storagePath,
      uploadedAt: new Date("2026-05-13T15:00:00.000Z"),
      processingStatus: "PROCESSING",
      failureMessage: null,
    });
    sopDocumentUpdate.mockResolvedValue({});
    const fetch = stubVoyageEmbedding();
    const { processSopIngestionJob } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    await expect(
      processSopIngestionJob({ sopDocumentId: "doc-pdf-corrupt" }),
    ).rejects.toThrow(/SOP Document PDF could not be parsed/);

    expect(fetch).not.toHaveBeenCalled();
    expect(executeRaw).not.toHaveBeenCalled();
    expect(sopDocumentUpdate).toHaveBeenCalledWith({
      where: { id: "doc-pdf-corrupt" },
      data: {
        processingStatus: "FAILED",
        failureMessage: expect.stringMatching(/SOP Document PDF could not be parsed/),
      },
    });
  });

  test("retries retryable Voyage embedding failures before marking the SOP Document FAILED", async () => {
    const storageDir = "/tmp/propertylead-review-desk/sops";
    const storagePath = `${storageDir}/doc-embedding-failure`;
    await import("node:fs/promises").then(async (fs) => {
      await fs.mkdir(storageDir, { recursive: true });
      await fs.writeFile(storagePath, "Call every new lead within five minutes.");
    });
    sopDocumentFindUnique.mockResolvedValue({
      id: "doc-embedding-failure",
      originalFilename: "seller-playbook.txt",
      contentType: "text/plain",
      byteSize: 40,
      storagePath,
      uploadedAt: new Date("2026-05-13T15:00:00.000Z"),
      processingStatus: "PROCESSING",
      failureMessage: null,
    });
    sopDocumentUpdate.mockResolvedValue({});
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
    expect(executeRaw).not.toHaveBeenCalled();
    expect(sopDocumentUpdate).toHaveBeenCalledWith({
      where: {
        id: "doc-embedding-failure",
      },
      data: {
        processingStatus: "FAILED",
        failureMessage: "Voyage embeddings request failed with 503",
      },
    });
  });

  test("keeps delete unavailable until the deletion slice lands", async () => {
    const { deleteSopDocument } = await importWithRequiredEnv(() =>
      import("./index"),
    );

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
            input_type: "query",
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
