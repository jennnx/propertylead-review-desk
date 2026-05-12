import { handleHubSpotWebhookEvent } from "../../hubspot-workflows";
import {
  claimHubSpotWebhookEventForProcessing,
  markHubSpotWebhookEventFailed,
  markHubSpotWebhookEventProcessed,
} from "./mutations";
import { getHubSpotWebhookEventForProcessing } from "./queries";

const PROCESSING_ATTEMPTS = 3;

export type ProcessHubSpotWebhookProcessingJobInput = {
  hubSpotWebhookEventId: string;
};

export async function processHubSpotWebhookProcessingJob({
  hubSpotWebhookEventId,
}: ProcessHubSpotWebhookProcessingJobInput): Promise<void> {
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

      await handleHubSpotWebhookEvent({
        normalizedEvent: event.normalizedEvent,
        rawWebhook: event.rawWebhook,
      });
    });
  } catch (error) {
    await markHubSpotWebhookEventFailed(hubSpotWebhookEventId);
    throw error;
  }

  await markHubSpotWebhookEventProcessed(hubSpotWebhookEventId, new Date());
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
