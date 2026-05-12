import type { Prisma } from "@prisma/client";

import { getPrismaClient } from "../../database";

export type HubSpotWebhookEventForProcessing = {
  id: string;
  normalizedEvent: Prisma.JsonValue;
  rawWebhook: Prisma.JsonValue;
};

export async function getHubSpotWebhookEventForProcessing(
  id: string,
): Promise<HubSpotWebhookEventForProcessing | null> {
  return getPrismaClient().hubSpotWebhookEvent.findUnique({
    where: {
      id,
    },
    select: {
      id: true,
      normalizedEvent: true,
      rawWebhook: true,
    },
  });
}
