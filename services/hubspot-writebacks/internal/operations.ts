import { hubSpot } from "@/services/hubspot";
import type { HubSpotWritebackProposal } from "../../hubspot-workflows";

import { executeHubSpotWritebackPlan } from "./executor";
import {
  createPendingHubSpotWriteback,
  markHubSpotWritebackApplied,
  markHubSpotWritebackRejected,
  updateHubSpotWritebackFeedbackNote,
} from "./mutations";
import {
  findHubSpotWritebackForApproval,
  findHubSpotWritebackReviewDetail,
  listDecidedHubSpotWritebackReviewItems,
  listPendingHubSpotWritebackReviewItems,
} from "./queries";
export type {
  HubSpotWritebackPlanFieldUpdateView,
  HubSpotWritebackReviewDetail,
  HubSpotWritebackReviewItem,
  HubSpotWritebackReviewState,
} from "./queries";

export type RecordProposedHubSpotWritebackInput = {
  hubSpotWorkflowRunId: string;
  plan: HubSpotWritebackProposal;
};

export async function recordProposedHubSpotWriteback(
  input: RecordProposedHubSpotWritebackInput,
): Promise<void> {
  await createPendingHubSpotWriteback({
    hubSpotWorkflowRunId: input.hubSpotWorkflowRunId,
    plan: input.plan,
  });
}

export type ApproveHubSpotWritebackResult =
  | { ok: true }
  | { ok: false; message: string };

export async function approveHubSpotWriteback(
  id: string,
  options: { reviewDeskFeedbackNote?: string | null } = {},
): Promise<ApproveHubSpotWritebackResult> {
  const writeback = await findHubSpotWritebackForApproval(id);

  if (!writeback) {
    return { ok: false, message: "HubSpot Writeback was not found." };
  }

  if (writeback.state !== "PENDING") {
    return {
      ok: false,
      message: "Only pending HubSpot Writebacks can be approved.",
    };
  }

  const execution = await executeHubSpotWritebackPlan({
    contactId: writeback.contactId,
    plan: writeback.plan,
    hubSpot,
  });

  if (!execution.ok) {
    return {
      ok: false,
      message:
        execution.reason === "hubspot_error"
          ? "HubSpot could not apply this writeback. Please try again."
          : execution.message,
    };
  }

  await markHubSpotWritebackApplied({
    id,
    metadata: execution.metadata,
    reviewDeskFeedbackNote: options.reviewDeskFeedbackNote,
  });

  return { ok: true };
}

export async function rejectHubSpotWriteback(
  id: string,
  options: { reviewDeskFeedbackNote?: string | null } = {},
): Promise<ApproveHubSpotWritebackResult> {
  const writeback = await findHubSpotWritebackForApproval(id);

  if (!writeback) {
    return { ok: false, message: "HubSpot Writeback was not found." };
  }

  if (writeback.state !== "PENDING") {
    return {
      ok: false,
      message: "Only pending HubSpot Writebacks can be rejected.",
    };
  }

  await markHubSpotWritebackRejected({
    id,
    reviewDeskFeedbackNote: options.reviewDeskFeedbackNote,
  });

  return { ok: true };
}

export async function updateReviewDeskFeedbackNote(
  id: string,
  reviewDeskFeedbackNote: string | null,
): Promise<void> {
  await updateHubSpotWritebackFeedbackNote({
    id,
    reviewDeskFeedbackNote,
  });
}

export async function listPendingHubSpotWritebacks() {
  return listPendingHubSpotWritebackReviewItems();
}

export async function listDecidedHubSpotWritebacks() {
  return listDecidedHubSpotWritebackReviewItems();
}

export async function getHubSpotWritebackReview(id: string) {
  return findHubSpotWritebackReviewDetail(id);
}
