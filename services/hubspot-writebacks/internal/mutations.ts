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
}: {
  id: string;
  metadata: HubSpotWritebackExecutionMetadata;
}): Promise<void> {
  await getPrismaClient().hubSpotWriteback.update({
    where: { id },
    data: {
      state: "APPLIED",
      appliedAt: new Date(),
      applicationMetadata: metadata as unknown as Prisma.InputJsonValue,
    },
  });
}
