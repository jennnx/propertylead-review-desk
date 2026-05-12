import {
  QUEUE_NAMES,
  enqueueQueueJobWithRetries,
} from "../../queue";
import type { HubSpotWebhookProcessingJobCandidate } from "./mutations";

export type HubSpotWebhookProcessingJobData = {
  hubSpotWebhookEventId: string;
};

const ENQUEUE_ATTEMPTS = 3;
const ENQUEUE_RETRY_DELAY_MS = 50;

export function createHubSpotWebhookProcessingJobId(
  hubSpotWebhookEventId: string,
): string {
  return `hubspot-webhook-event:${hubSpotWebhookEventId}`;
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
    enqueueAttempts: ENQUEUE_ATTEMPTS,
    retryDelayMs: ENQUEUE_RETRY_DELAY_MS,
  });
}
