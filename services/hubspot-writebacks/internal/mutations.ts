import type { Prisma } from "@prisma/client";

import { getPrismaClient } from "../../database";
import type { HubSpotWritebackProposal } from "../../hubspot-workflows";
import type { HubSpotWritebackExecutionMetadata } from "./executor";

const HUBSPOT_WRITEBACK_SETTINGS_ID = "global";

export type CreatePendingHubSpotWritebackInput = {
  hubSpotWorkflowRunId: string;
  plan: HubSpotWritebackProposal;
};

export async function createPendingHubSpotWriteback(
  input: CreatePendingHubSpotWritebackInput,
): Promise<{ id: string }> {
  return getPrismaClient().hubSpotWriteback.create({
    data: {
      hubSpotWorkflowRunId: input.hubSpotWorkflowRunId,
      plan: input.plan as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
}

export async function markHubSpotWritebackApplied({
  id,
  metadata,
}: {
  id: string;
  metadata: HubSpotWritebackExecutionMetadata;
}): Promise<boolean> {
  const result = await getPrismaClient().hubSpotWriteback.updateMany({
    where: { id, state: "PENDING" },
    data: {
      state: "APPLIED",
      appliedAt: new Date(),
      applicationMetadata: metadata as unknown as Prisma.InputJsonValue,
    },
  });

  return result.count === 1;
}

export async function markHubSpotWritebackAutoApplied({
  id,
  metadata,
}: {
  id: string;
  metadata: HubSpotWritebackExecutionMetadata;
}): Promise<boolean> {
  const result = await getPrismaClient().hubSpotWriteback.updateMany({
    where: { id, state: "PENDING" },
    data: {
      state: "AUTO_APPLIED",
      appliedAt: new Date(),
      applicationMetadata: metadata as unknown as Prisma.InputJsonValue,
    },
  });

  return result.count === 1;
}

export async function setHubSpotWritebackAutoModeEnabled(
  enabled: boolean,
): Promise<boolean> {
  const row = await getPrismaClient().hubSpotWritebackSettings.upsert({
    where: { id: HUBSPOT_WRITEBACK_SETTINGS_ID },
    create: {
      id: HUBSPOT_WRITEBACK_SETTINGS_ID,
      autoModeEnabled: enabled,
    },
    update: {
      autoModeEnabled: enabled,
    },
    select: { autoModeEnabled: true },
  });

  return row.autoModeEnabled;
}
