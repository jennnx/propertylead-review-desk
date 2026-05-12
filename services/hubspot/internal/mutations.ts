import type { Prisma } from "@prisma/client";

import { getPrismaClient } from "../../database";

export type RecordHubSpotWebhookEventInput = {
  dedupeKey: string;
  rawWebhook: Record<string, unknown>;
  normalizedEvent: {
    type: "contact.created" | "conversation.message.received";
    hubSpotObjectId: string;
    hubSpotPortalId: string | null;
    occurredAt: string | null;
    hubSpotMessageId?: string;
  };
};

export type HubSpotWebhookProcessingJobCandidate = {
  id: string;
};

export type RecordHubSpotWebhookEventsResult = {
  persistedEventCount: number;
  processingJobCandidates: HubSpotWebhookProcessingJobCandidate[];
};

export async function recordHubSpotWebhookEvents(
  events: RecordHubSpotWebhookEventInput[],
  receivedAt: Date,
): Promise<RecordHubSpotWebhookEventsResult> {
  if (events.length === 0) {
    return {
      persistedEventCount: 0,
      processingJobCandidates: [],
    };
  }

  const prisma = getPrismaClient();

  const result = await prisma.hubSpotWebhookEvent.createMany({
    data: events.map((event) => ({
      dedupeKey: event.dedupeKey,
      normalizedEvent: event.normalizedEvent as Prisma.InputJsonObject,
      processedAt: null,
      processingStatus: "NEW",
      rawWebhook: event.rawWebhook as Prisma.InputJsonObject,
      receivedAt,
    })),
    skipDuplicates: true,
  });

  const processingJobCandidates = await prisma.hubSpotWebhookEvent.findMany({
    where: {
      dedupeKey: {
        in: events.map((event) => event.dedupeKey),
      },
      processingStatus: "NEW",
    },
    select: {
      id: true,
    },
  });

  return {
    persistedEventCount: result.count,
    processingJobCandidates,
  };
}

export async function claimHubSpotWebhookEventForProcessing(
  id: string,
): Promise<boolean> {
  const result = await getPrismaClient().hubSpotWebhookEvent.updateMany({
    where: {
      id,
      processingStatus: "NEW",
    },
    data: {
      processingStatus: "PROCESSING",
    },
  });

  return result.count === 1;
}

export async function markHubSpotWebhookEventProcessed(
  id: string,
  processedAt: Date,
): Promise<void> {
  await getPrismaClient().hubSpotWebhookEvent.updateMany({
    where: {
      id,
      processingStatus: "PROCESSING",
    },
    data: {
      processingStatus: "PROCESSED",
      processedAt,
    },
  });
}

export async function markHubSpotWebhookEventFailed(id: string): Promise<void> {
  await getPrismaClient().hubSpotWebhookEvent.updateMany({
    where: {
      id,
      processingStatus: "PROCESSING",
    },
    data: {
      processingStatus: "FAILED",
    },
  });
}
