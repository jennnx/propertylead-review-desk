import { hubSpot } from "@/services/hubspot";
import type { HubSpotWritebackProposal } from "../../hubspot-workflows";

import { handoffFinalizedHubSpotWriteback } from "./handoff";
import { executeHubSpotWritebackPlan } from "./executor";
import {
  markHubSpotWritebackApplied,
  markHubSpotWritebackRejected,
  setHubSpotWritebackAutoModeEnabled,
  updateHubSpotWritebackFeedbackNote,
} from "./mutations";
import {
  findHubSpotWritebackForApproval,
  findHubSpotWritebackReviewDetail,
  getHubSpotWritebackAutoModeEnabled,
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
  await handoffFinalizedHubSpotWriteback({
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

  const markedApplied = await markHubSpotWritebackApplied({
    id,
    metadata: execution.metadata,
    reviewDeskFeedbackNote: options.reviewDeskFeedbackNote,
  });

  if (!markedApplied) {
    return {
      ok: false,
      message: "Only pending HubSpot Writebacks can be approved.",
    };
  }

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

  const markedRejected = await markHubSpotWritebackRejected({
    id,
    reviewDeskFeedbackNote: options.reviewDeskFeedbackNote,
  });

  if (!markedRejected) {
    return {
      ok: false,
      message: "Only pending HubSpot Writebacks can be rejected.",
    };
  }

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

export type HubSpotWritebackAutoMode = {
  enabled: boolean;
};

export async function getHubSpotWritebackAutoMode(): Promise<HubSpotWritebackAutoMode> {
  return { enabled: await getHubSpotWritebackAutoModeEnabled() };
}

export async function setHubSpotWritebackAutoMode({
  enabled,
}: HubSpotWritebackAutoMode): Promise<HubSpotWritebackAutoMode> {
  return {
    enabled: await setHubSpotWritebackAutoModeEnabled(enabled),
  };
}
