import { getPrismaClient } from "../../database";

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
