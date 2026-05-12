import {
  claimHubSpotWebhookEventForProcessing,
  getHubSpotWebhookEventForProcessing,
  markHubSpotWebhookEventFailed,
  markHubSpotWebhookEventProcessed,
} from "../../services/hubspot";
import type { Job } from "../../services/queue";

const PROCESSING_ATTEMPTS = 3;

type HubSpotWebhookProcessingJobData = {
  hubSpotWebhookEventId: string;
};

export async function processHubSpotWebhookProcess(
  job: Job<HubSpotWebhookProcessingJobData>,
): Promise<void> {
  const { hubSpotWebhookEventId } = job.data;
  const claimed = await claimHubSpotWebhookEventForProcessing(
    hubSpotWebhookEventId,
  );
  if (!claimed) {
    console.info("Skipped HubSpot Webhook Processing Job", {
      hubSpotWebhookEventId,
      reason: "not_new",
    });
    return;
  }

  try {
    await retryInternally(async () => {
      const event = await getHubSpotWebhookEventForProcessing(
        hubSpotWebhookEventId,
      );
      if (!event) {
        throw new Error(
          `HubSpot Webhook Event ${hubSpotWebhookEventId} was claimed but not found`,
        );
      }

      console.info("Processing HubSpot Webhook Event", {
        hubSpotWebhookEventId: event.id,
        normalizedEvent: event.normalizedEvent,
        rawWebhook: event.rawWebhook,
      });
    });
  } catch (error) {
    await markHubSpotWebhookEventFailed(hubSpotWebhookEventId);
    throw error;
  }

  await markHubSpotWebhookEventProcessed(
    hubSpotWebhookEventId,
    new Date(),
  );
}

async function retryInternally(work: () => Promise<void>): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= PROCESSING_ATTEMPTS; attempt++) {
    try {
      await work();
      return;
    } catch (error) {
      lastError = error;
      if (attempt < PROCESSING_ATTEMPTS) {
        console.warn("Retrying HubSpot Webhook Processing Job action", {
          attempt,
          maxAttempts: PROCESSING_ATTEMPTS,
          error,
        });
      }
    }
  }

  throw lastError;
}
