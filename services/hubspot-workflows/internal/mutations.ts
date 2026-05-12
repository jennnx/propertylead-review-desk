import { Prisma } from "@prisma/client";

import { getPrismaClient } from "../../database";

export type HubSpotWorkflowRunRecord = {
  id: string;
};

export type HubSpotWorkflowRunContactSnapshot = {
  id: string;
  properties: Record<string, string | null>;
};

export type HubSpotWorkflowRunConversationMessage = {
  id: string;
  threadId: string;
  actorId: string | null;
  direction: string | null;
  text: string | null;
  richText: string | null;
  createdAt: string | null;
  truncationStatus: string | null;
};

export type HubSpotWorkflowRunCurrentConversationSession = {
  messageLimit: number;
  messages: HubSpotWorkflowRunConversationMessage[];
};

export type HubSpotWorkflowRunContactCreatedEnrichmentInputContext = {
  source: "hubspot_contact_created";
  hubSpotPortalId: string | null;
  occurredAt: string | null;
  contact: HubSpotWorkflowRunContactSnapshot;
};

export type HubSpotWorkflowRunInboundMessageEnrichmentInputContext = {
  source: "hubspot_inbound_message";
  hubSpotPortalId: string | null;
  occurredAt: string | null;
  triggeringMessageId: string;
  contact: HubSpotWorkflowRunContactSnapshot;
  currentConversationSession: HubSpotWorkflowRunCurrentConversationSession;
};

export type HubSpotWorkflowRunEnrichmentInputContext =
  | HubSpotWorkflowRunContactCreatedEnrichmentInputContext
  | HubSpotWorkflowRunInboundMessageEnrichmentInputContext;

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
  await getPrismaClient().hubSpotWorkflowRun.update({
    where: {
      id,
    },
    data: {
      enrichmentInputContext,
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
