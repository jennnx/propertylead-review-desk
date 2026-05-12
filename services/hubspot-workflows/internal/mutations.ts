import { getPrismaClient } from "../../database";

export type HubSpotWorkflowRunRecord = {
  id: string;
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
