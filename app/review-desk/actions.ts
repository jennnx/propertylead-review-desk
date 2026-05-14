"use server";

import { revalidatePath } from "next/cache";

import {
  approveHubSpotWriteback,
  rejectHubSpotWriteback,
  updateReviewDeskFeedbackNote,
} from "@/services/hubspot-writebacks";

export type ReviewDeskDecisionActionState = {
  status: "idle" | "error";
  message: string | null;
};

export async function decideHubSpotWritebackAction(
  _state: ReviewDeskDecisionActionState,
  formData: FormData,
): Promise<ReviewDeskDecisionActionState> {
  const id = formData.get("hubSpotWritebackId");
  const intent = formData.get("intent");

  if (typeof id !== "string" || id.length === 0) {
    return {
      status: "error",
      message: "Missing HubSpot Writeback id.",
    };
  }

  const reviewDeskFeedbackNote = readOptionalFeedbackNote(formData);
  const result =
    intent === "approve"
      ? await approveHubSpotWriteback(id, { reviewDeskFeedbackNote })
      : intent === "reject"
        ? await rejectHubSpotWriteback(id, { reviewDeskFeedbackNote })
        : { ok: false, message: "Choose a Review Desk decision." };

  if (!result.ok) {
    return {
      status: "error",
      message: result.message,
    };
  }

  revalidatePath("/review-desk");
  revalidatePath(`/review-desk/${id}`);
  return { status: "idle", message: null };
}

export type ReviewDeskFeedbackNoteActionState = {
  status: "idle" | "saved" | "error";
  message: string | null;
};

export async function saveReviewDeskFeedbackNoteAction(
  _state: ReviewDeskFeedbackNoteActionState,
  formData: FormData,
): Promise<ReviewDeskFeedbackNoteActionState> {
  const id = formData.get("hubSpotWritebackId");
  const intent = formData.get("intent");

  if (typeof id !== "string" || id.length === 0) {
    return {
      status: "error",
      message: "Missing HubSpot Writeback id.",
    };
  }

  if (intent !== "save" && intent !== "clear") {
    return {
      status: "error",
      message: "Choose a feedback note action.",
    };
  }

  await updateReviewDeskFeedbackNote(id, readFeedbackNote(intent, formData));

  revalidatePath("/review-desk");
  revalidatePath(`/review-desk/${id}`);
  return {
    status: "saved",
    message:
      intent === "clear" ? "Feedback note cleared." : "Feedback note saved.",
  };
}

function readOptionalFeedbackNote(formData: FormData): string | null {
  const note = formData.get("reviewDeskFeedbackNote");

  if (typeof note !== "string") return null;
  const trimmed = note.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readFeedbackNote(
  intent: "save" | "clear",
  formData: FormData,
): string | null {
  return intent === "clear" ? null : readOptionalFeedbackNote(formData);
}
