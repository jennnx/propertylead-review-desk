import { beforeEach, describe, expect, test, vi } from "vitest";

import type { Job } from "../../services/queue";

const processHubSpotWebhookProcessingJob = vi.fn();

vi.mock("../../services/hubspot-queue-processing", () => ({
  processHubSpotWebhookProcessingJob,
}));

describe("HubSpot Webhook Processing Job", () => {
  beforeEach(() => {
    processHubSpotWebhookProcessingJob.mockReset();
  });

  test("delegates HubSpot Webhook Processing Job behavior to the queue-processing service", async () => {
    processHubSpotWebhookProcessingJob.mockResolvedValue(undefined);
    const { processHubSpotWebhookProcess } = await import("./hubspot-webhook-process");

    await processHubSpotWebhookProcess(
      createJob("hubspot-event-to-process"),
    );

    expect(processHubSpotWebhookProcessingJob).toHaveBeenCalledWith({
      hubSpotWebhookEventId: "hubspot-event-to-process",
    });
  });
});

function createJob(hubSpotWebhookEventId: string): Job<{
  hubSpotWebhookEventId: string;
}> {
  return {
    data: {
      hubSpotWebhookEventId,
    },
  } as Job<{ hubSpotWebhookEventId: string }>;
}
