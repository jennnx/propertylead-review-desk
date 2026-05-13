import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { env } from "@/lib/env";
import { getPrismaClient } from "@/services/database";
import { QUEUE_NAMES, enqueueQueueJobWithRetries } from "@/services/queue";

const MAX_SOP_UPLOAD_BYTES = 10 * 1024 * 1024;

const SUPPORTED_SOP_CONTENT_TYPES = [
  "text/plain",
  "text/markdown",
  "application/pdf",
] as const;

const SUPPORTED_SOP_FILENAME_EXTENSIONS = [".txt", ".md", ".pdf"] as const;

const UploadSopDocumentInputSchema = z
  .object({
    originalFilename: z.string().min(1, "SOP Document filename is required."),
    contentType: z.string(),
    byteSize: z.number().int().nonnegative(),
    body: z.instanceof(Buffer),
  })
  .superRefine((input, ctx) => {
    if (
      !(SUPPORTED_SOP_CONTENT_TYPES as readonly string[]).includes(
        input.contentType,
      )
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["contentType"],
        message: `SOP Document content type must be one of: ${SUPPORTED_SOP_CONTENT_TYPES.join(", ")}.`,
      });
    }

    const filename = input.originalFilename.toLowerCase();
    if (
      !SUPPORTED_SOP_FILENAME_EXTENSIONS.some((extension) =>
        filename.endsWith(extension),
      )
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["originalFilename"],
        message: `SOP Document filename must end with one of: ${SUPPORTED_SOP_FILENAME_EXTENSIONS.join(", ")}.`,
      });
    }

    if (
      input.byteSize > MAX_SOP_UPLOAD_BYTES ||
      input.body.byteLength > MAX_SOP_UPLOAD_BYTES
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["byteSize"],
        message: "SOP Document uploads must be 10 MB or smaller.",
      });
    }
  });

export type UploadSopDocumentInput = z.infer<typeof UploadSopDocumentInputSchema>;

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
  let storagePath: string;
  try {
    const document = await getPrismaClient().sopDocument.delete({
      where: { id },
      select: { storagePath: true },
    });
    storagePath = document.storagePath;
  } catch (error) {
    if (isPrismaRecordNotFoundError(error)) {
      return;
    }
    throw error;
  }

  await removeStoredFileIfPresent(storagePath);
}

function isPrismaRecordNotFoundError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  );
}

function validateUpload(input: UploadSopDocumentInput): void {
  const result = UploadSopDocumentInputSchema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(issue?.message ?? "Invalid SOP Document upload.");
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
