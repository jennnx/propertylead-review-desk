import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { env } from "@/lib/env";
import { QUEUE_NAMES, enqueueQueueJobWithRetries } from "@/services/queue";

import {
  deleteSopDocumentRow,
  markSopDocumentFailed,
  recordSopDocumentUpload,
  type SopDocumentRow,
} from "./mutations";
import { listRecentSopDocuments } from "./queries";

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
  const document = await recordSopDocumentUpload({
    id,
    originalFilename: input.originalFilename,
    contentType: input.contentType,
    byteSize: input.byteSize,
    storagePath,
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
    await markSopDocumentFailed(document.id, toFailureMessage(error));
    await removeStoredFileIfPresent(storagePath);
    throw error;
  }

  return mapDocument(document, 0);
}

export async function listSopDocuments(): Promise<SopDocumentSummary[]> {
  return listRecentSopDocuments(50);
}

export async function getSopDocument(id: string): Promise<SopDocument | null> {
  void id;
  return notImplemented();
}

export async function deleteSopDocument(id: string): Promise<void> {
  const deleted = await deleteSopDocumentRow(id);
  if (deleted) {
    await removeStoredFileIfPresent(deleted.storagePath);
  }
}

function validateUpload(input: UploadSopDocumentInput): void {
  const result = UploadSopDocumentInputSchema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(issue?.message ?? "Invalid SOP Document upload.");
  }
}

function mapDocument(
  document: SopDocumentRow,
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
