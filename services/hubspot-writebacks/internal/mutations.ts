import type { Prisma } from "@prisma/client";

import { getPrismaClient } from "../../database";
import type { HubSpotWritebackProposal } from "../../hubspot-workflows";
import type { HubSpotWritebackExecutionMetadata } from "./executor";

export type CreatePendingHubSpotWritebackInput = {
  hubSpotWorkflowRunId: string;
  plan: HubSpotWritebackProposal;
};

export async function createPendingHubSpotWriteback(
  input: CreatePendingHubSpotWritebackInput,
): Promise<void> {
  await getPrismaClient().hubSpotWriteback.create({
    data: {
      hubSpotWorkflowRunId: input.hubSpotWorkflowRunId,
      plan: input.plan as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function markHubSpotWritebackApplied({
  id,
  metadata,
  reviewDeskFeedbackNote,
}: {
  id: string;
  metadata: HubSpotWritebackExecutionMetadata;
  reviewDeskFeedbackNote?: string | null;
}): Promise<void> {
  await getPrismaClient().hubSpotWriteback.update({
    where: { id },
    data: {
      state: "APPLIED",
      appliedAt: new Date(),
      applicationMetadata: metadata as unknown as Prisma.InputJsonValue,
      ...(reviewDeskFeedbackNote !== undefined ? { reviewDeskFeedbackNote } : {}),
    },
  });
}

export async function markHubSpotWritebackRejected({
  id,
  reviewDeskFeedbackNote,
}: {
  id: string;
  reviewDeskFeedbackNote?: string | null;
}): Promise<void> {
  await getPrismaClient().hubSpotWriteback.update({
    where: { id },
    data: {
      state: "REJECTED",
      ...(reviewDeskFeedbackNote !== undefined ? { reviewDeskFeedbackNote } : {}),
    },
  });
}

export async function updateHubSpotWritebackFeedbackNote({
  id,
  reviewDeskFeedbackNote,
}: {
  id: string;
  reviewDeskFeedbackNote: string | null;
}): Promise<void> {
  await getPrismaClient().hubSpotWriteback.update({
    where: { id },
    data: {
      reviewDeskFeedbackNote,
    },
  });
}
