"use server";

import { Buffer } from "node:buffer";

import { revalidatePath } from "next/cache";

import { deleteSopDocument, uploadSopDocument } from "@/services/sop";

const MAX_SOP_UPLOAD_BYTES = 10 * 1024 * 1024;

export type SopUploadActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

export type SopDeleteActionState = {
  status: "idle" | "error";
  message: string | null;
};

export async function uploadSopDocumentAction(
  _state: SopUploadActionState,
  formData: FormData,
): Promise<SopUploadActionState> {
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return {
      status: "error",
      message: "Choose a .txt, .md, or .pdf SOP Document to upload.",
    };
  }

  if (file.size > MAX_SOP_UPLOAD_BYTES) {
    return {
      status: "error",
      message: "SOP Document uploads must be 10 MB or smaller.",
    };
  }

  try {
    await uploadSopDocument({
      originalFilename: file.name,
      contentType: file.type,
      byteSize: file.size,
      body: Buffer.from(await file.arrayBuffer()),
    });
    revalidatePath("/sops");

    return {
      status: "success",
      message: "Upload accepted. Processing has started.",
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "The SOP Document upload failed.",
    };
  }
}

export async function deleteSopDocumentAction(
  _state: SopDeleteActionState,
  formData: FormData,
): Promise<SopDeleteActionState> {
  const id = formData.get("sopDocumentId");

  if (typeof id !== "string" || id.length === 0) {
    return {
      status: "error",
      message: "Missing SOP Document id.",
    };
  }

  try {
    await deleteSopDocument(id);
    revalidatePath("/sops");
    return { status: "idle", message: null };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "The SOP Document could not be deleted.",
    };
  }
}
