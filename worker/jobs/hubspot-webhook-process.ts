import { processHubSpotWebhookProcessingJob } from "../../services/hubspot-queue-processing";
import type { Job } from "../../services/queue";

type HubSpotWebhookProcessingJobData = {
  hubSpotWebhookEventId: string;
};

export async function processHubSpotWebhookProcess(
  job: Job<HubSpotWebhookProcessingJobData>,
): Promise<void> {
  await processHubSpotWebhookProcessingJob({
    hubSpotWebhookEventId: job.data.hubSpotWebhookEventId,
  });
}
