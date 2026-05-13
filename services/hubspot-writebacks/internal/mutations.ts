import type { Prisma } from "@prisma/client";

import { getPrismaClient } from "../../database";
import type { HubSpotWritebackProposal } from "../../hubspot-workflows";

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
