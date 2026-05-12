import { Prisma } from "@prisma/client";

import { getPrismaClient } from "../../database";

export type HubSpotWorkflowRunRecord = {
  id: string;
};

export type HubSpotWorkflowRunEnrichmentInputContext = {
  source: string;
  hubSpotPortalId: string | null;
  occurredAt: string | null;
  contact: {
    id: string;
    properties: Record<string, string | null>;
  };
};

export async function startHubSpotWorkflowRun(
  hubSpotWebhookEventId: string,
): Promise<HubSpotWorkflowRunRecord> {
  return getPrismaClient().hubSpotWorkflowRun.upsert({
    where: {
      hubSpotWebhookEventId,
    },
    create: {
      hubSpotWebhookEventId,
      status: "IN_PROGRESS",
    },
    update: {
      status: "IN_PROGRESS",
      outcome: null,
      enrichmentInputContext: Prisma.DbNull,
      failureMessage: null,
      completedAt: null,
    },
    select: {
      id: true,
    },
  });
}

export async function markHubSpotWorkflowRunSucceededWithNoWriteback(
  id: string,
  completedAt: Date,
): Promise<void> {
  await getPrismaClient().hubSpotWorkflowRun.update({
    where: {
      id,
    },
    data: {
      status: "SUCCEEDED",
      outcome: "NO_WRITEBACK_NEEDED",
      completedAt,
    },
  });
}

export async function recordHubSpotWorkflowRunEnrichmentInputContext(
  id: string,
  enrichmentInputContext: HubSpotWorkflowRunEnrichmentInputContext,
): Promise<void> {
  const input: Prisma.InputJsonValue = enrichmentInputContext;

  await getPrismaClient().hubSpotWorkflowRun.update({
    where: {
      id,
    },
    data: {
      enrichmentInputContext: input,
    },
  });
}

export async function markHubSpotWorkflowRunFailed(
  id: string,
  failureMessage: string,
  completedAt: Date,
): Promise<void> {
  await getPrismaClient().hubSpotWorkflowRun.update({
    where: {
      id,
    },
    data: {
      status: "FAILED",
      outcome: null,
      failureMessage,
      completedAt,
    },
  });
}
