import {
  QUEUE_NAMES,
  enqueueQueueJobWithRetries,
} from "../../queue";
import type { HubSpotWebhookProcessingJobCandidate } from "./mutations";

export type HubSpotWebhookProcessingJobData = {
  hubSpotWebhookEventId: string;
};

export function createHubSpotWebhookProcessingJobId(
  hubSpotWebhookEventId: string,
): string {
  return `hubspot-webhook-event-${hubSpotWebhookEventId}`;
}

export async function enqueueHubSpotWebhookProcessingJobs(
  candidates: HubSpotWebhookProcessingJobCandidate[],
): Promise<number> {
  for (const candidate of candidates) {
    await enqueueHubSpotWebhookProcessingJob(candidate.id);
  }

  return candidates.length;
}

async function enqueueHubSpotWebhookProcessingJob(
  hubSpotWebhookEventId: string,
): Promise<void> {
  await enqueueQueueJobWithRetries<
    HubSpotWebhookProcessingJobData,
    typeof QUEUE_NAMES.HUBSPOT_WEBHOOK_PROCESS
  >({
    queueName: QUEUE_NAMES.HUBSPOT_WEBHOOK_PROCESS,
    jobName: QUEUE_NAMES.HUBSPOT_WEBHOOK_PROCESS,
    data: { hubSpotWebhookEventId },
    jobOptions: {
      jobId: createHubSpotWebhookProcessingJobId(hubSpotWebhookEventId),
    },
  });
}
