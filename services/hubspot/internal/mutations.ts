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

export async function recordHubSpotWebhookEvents(
  events: RecordHubSpotWebhookEventInput[],
  receivedAt: Date,
): Promise<number> {
  if (events.length === 0) return 0;

  const result = await getPrismaClient().hubSpotWebhookEvent.createMany({
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

  return result.count;
}
