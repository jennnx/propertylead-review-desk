export {
  retrieveRelevantSopChunks,
  type RetrievedSopChunk,
} from "./internal/retrieval";

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
  void input;
  return notImplemented();
}

export async function listSopDocuments(): Promise<SopDocumentSummary[]> {
  return notImplemented();
}

export async function getSopDocument(id: string): Promise<SopDocument | null> {
  void id;
  return notImplemented();
}

export async function deleteSopDocument(id: string): Promise<void> {
  void id;
  return notImplemented();
}
