import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { env } from "@/lib/env";
import { getPrismaClient } from "@/services/database";
import { QUEUE_NAMES, enqueueQueueJobWithRetries } from "@/services/queue";

export type UploadSopDocumentInput = {
  originalFilename: string;
  contentType: string;
  byteSize: number;
  body: Buffer;
};

export type SopDocumentSummary = {
  id: string;
  originalFilename: string;
  contentType: string;
  byteSize: number;
  uploadedAt: Date;
  processingStatus: "PROCESSING" | "READY" | "FAILED";
  failureMessage: string | null;
  chunkCount: number;
};

export type SopDocument = SopDocumentSummary & {
  storagePath: string;
};

const MAX_SOP_UPLOAD_BYTES = 10 * 1024 * 1024;
const TXT_CONTENT_TYPE = "text/plain";

async function notImplemented(): Promise<never> {
  throw new Error("not implemented");
}

export async function uploadSopDocument(
  input: UploadSopDocumentInput,
): Promise<SopDocument> {
  validateUpload(input);

  const id = randomUUID();
  const storagePath = path.join(env.SOP_STORAGE_DIR, id);
  const document = await getPrismaClient().sopDocument.create({
    data: {
      id,
      originalFilename: input.originalFilename,
      contentType: input.contentType,
      byteSize: input.byteSize,
      storagePath,
      processingStatus: "PROCESSING",
      failureMessage: null,
    },
  });

  try {
    await mkdir(env.SOP_STORAGE_DIR, { recursive: true });
    await writeFile(storagePath, input.body);
    await enqueueQueueJobWithRetries({
      queueName: QUEUE_NAMES.SOP_INGEST,
      jobName: QUEUE_NAMES.SOP_INGEST,
      data: {
        sopDocumentId: document.id,
      },
      jobOptions: {
        attempts: 1,
        jobId: `sop-ingest-${document.id}`,
      },
    });
  } catch (error) {
    await markUploadFailed(document.id, toFailureMessage(error));
    await removeStoredFileIfPresent(storagePath);
    throw error;
  }

  return mapDocument(document, 0);
}

export async function listSopDocuments(): Promise<SopDocumentSummary[]> {
  const documents = await getPrismaClient().sopDocument.findMany({
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

  return documents.map((document) => {
    const { storagePath: _storagePath, _count, ...summary } = document;
    void _storagePath;
    return {
      ...summary,
      chunkCount: _count.chunks,
    };
  });
}

export async function getSopDocument(id: string): Promise<SopDocument | null> {
  void id;
  return notImplemented();
}

export async function deleteSopDocument(id: string): Promise<void> {
  void id;
  return notImplemented();
}

function validateUpload(input: UploadSopDocumentInput): void {
  if (!input.originalFilename.toLowerCase().endsWith(".txt")) {
    throw new Error("Only .txt SOP Document uploads are supported.");
  }

  if (input.contentType !== TXT_CONTENT_TYPE) {
    throw new Error("Only text/plain SOP Document uploads are supported.");
  }

  if (input.byteSize > MAX_SOP_UPLOAD_BYTES || input.body.byteLength > MAX_SOP_UPLOAD_BYTES) {
    throw new Error("SOP Document uploads must be 10 MB or smaller.");
  }
}

function mapDocument(
  document: Omit<SopDocument, "chunkCount">,
  chunkCount: number,
): SopDocument {
  return {
    id: document.id,
    originalFilename: document.originalFilename,
    contentType: document.contentType,
    byteSize: document.byteSize,
    storagePath: document.storagePath,
    uploadedAt: document.uploadedAt,
    processingStatus: document.processingStatus,
    failureMessage: document.failureMessage,
    chunkCount,
  };
}

async function markUploadFailed(
  sopDocumentId: string,
  failureMessage: string,
): Promise<void> {
  await getPrismaClient().sopDocument.update({
    where: {
      id: sopDocumentId,
    },
    data: {
      processingStatus: "FAILED",
      failureMessage,
    },
  });
}

async function removeStoredFileIfPresent(storagePath: string): Promise<void> {
  try {
    await unlink(storagePath);
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") {
      throw error;
    }
  }
}

function toFailureMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "SOP Document upload failed.";
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
