import { beforeEach, describe, expect, test, vi } from "vitest";

import { importWithRequiredEnv } from "@/tests/env";

const claimHubSpotWebhookEventForProcessing = vi.fn();
const getHubSpotWebhookEventForProcessing = vi.fn();
const markHubSpotWebhookEventFailed = vi.fn();
const markHubSpotWebhookEventProcessed = vi.fn();
const handleHubSpotWebhookEvent = vi.fn();

vi.mock("./internal/mutations", () => ({
  claimHubSpotWebhookEventForProcessing,
  markHubSpotWebhookEventFailed,
  markHubSpotWebhookEventProcessed,
}));

vi.mock("./internal/queries", () => ({
  getHubSpotWebhookEventForProcessing,
}));

vi.mock("@/services/hubspot-workflows", () => ({
  handleHubSpotWebhookEvent,
}));

describe("HubSpot queue processing service", () => {
  beforeEach(() => {
    claimHubSpotWebhookEventForProcessing.mockReset();
    claimHubSpotWebhookEventForProcessing.mockResolvedValue(true);
    getHubSpotWebhookEventForProcessing.mockReset();
    markHubSpotWebhookEventFailed.mockReset();
    markHubSpotWebhookEventFailed.mockResolvedValue(undefined);
    markHubSpotWebhookEventProcessed.mockReset();
    markHubSpotWebhookEventProcessed.mockResolvedValue(undefined);
    handleHubSpotWebhookEvent.mockReset();
  });

  test("claims a HubSpot Webhook Processing Job, delegates the HubSpot workflow, and marks the event processed", async () => {
    getHubSpotWebhookEventForProcessing.mockResolvedValue({
      id: "hubspot-event-to-process",
      normalizedEvent: {
        type: "contact.created",
        hubSpotObjectId: "123",
      },
      rawWebhook: {
        eventId: 1001,
      },
    });
    handleHubSpotWebhookEvent.mockResolvedValue(undefined);
    const { processHubSpotWebhookProcessingJob } =
      await importWithRequiredEnv(() => import("./index"));

    await processHubSpotWebhookProcessingJob({
      hubSpotWebhookEventId: "hubspot-event-to-process",
    });

    expect(claimHubSpotWebhookEventForProcessing).toHaveBeenCalledWith(
      "hubspot-event-to-process",
    );
    expect(getHubSpotWebhookEventForProcessing).toHaveBeenCalledWith(
      "hubspot-event-to-process",
    );
    expect(handleHubSpotWebhookEvent).toHaveBeenCalledWith({
      hubSpotWebhookEventId: "hubspot-event-to-process",
      normalizedEvent: {
        type: "contact.created",
        hubSpotObjectId: "123",
      },
      rawWebhook: {
        eventId: 1001,
      },
    });
    expect(markHubSpotWebhookEventProcessed).toHaveBeenCalledWith(
      "hubspot-event-to-process",
      expect.any(Date),
    );
  });

  test("skips HubSpot Webhook Processing Jobs when the event is no longer new", async () => {
    claimHubSpotWebhookEventForProcessing.mockResolvedValue(false);
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});
    const { processHubSpotWebhookProcessingJob } =
      await importWithRequiredEnv(() => import("./index"));

    await processHubSpotWebhookProcessingJob({
      hubSpotWebhookEventId: "already-claimed-event",
    });

    expect(getHubSpotWebhookEventForProcessing).not.toHaveBeenCalled();
    expect(handleHubSpotWebhookEvent).not.toHaveBeenCalled();
    expect(claimHubSpotWebhookEventForProcessing).toHaveBeenCalledTimes(1);
    expect(consoleInfo).toHaveBeenCalledWith(
      "Skipped HubSpot Webhook Processing Job",
      {
        hubSpotWebhookEventId: "already-claimed-event",
        reason: "not_new",
      },
    );
  });

  test("retries HubSpot workflow handling internally before marking the event processed", async () => {
    getHubSpotWebhookEventForProcessing.mockResolvedValue({
      id: "hubspot-event-retried-in-service",
      normalizedEvent: {
        type: "contact.created",
        hubSpotObjectId: "123",
      },
      rawWebhook: {
        eventId: 1001,
      },
    });
    handleHubSpotWebhookEvent
      .mockRejectedValueOnce(new Error("temporary workflow failure"))
      .mockRejectedValueOnce(new Error("second temporary workflow failure"))
      .mockResolvedValueOnce(undefined);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { processHubSpotWebhookProcessingJob } =
      await importWithRequiredEnv(() => import("./index"));

    await processHubSpotWebhookProcessingJob({
      hubSpotWebhookEventId: "hubspot-event-retried-in-service",
    });

    expect(getHubSpotWebhookEventForProcessing).toHaveBeenCalledTimes(3);
    expect(handleHubSpotWebhookEvent).toHaveBeenCalledTimes(3);
    expect(markHubSpotWebhookEventProcessed).toHaveBeenCalledWith(
      "hubspot-event-retried-in-service",
      expect.any(Date),
    );
  });

  test("marks the HubSpot Webhook Event failed when all processing attempts fail", async () => {
    getHubSpotWebhookEventForProcessing.mockResolvedValue({
      id: "hubspot-event-fails-in-service",
      normalizedEvent: {
        type: "contact.created",
        hubSpotObjectId: "123",
      },
      rawWebhook: {
        eventId: 1001,
      },
    });
    handleHubSpotWebhookEvent.mockRejectedValue(
      new Error("persistent workflow failure"),
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { processHubSpotWebhookProcessingJob } =
      await importWithRequiredEnv(() => import("./index"));

    await expect(
      processHubSpotWebhookProcessingJob({
        hubSpotWebhookEventId: "hubspot-event-fails-in-service",
      }),
    ).rejects.toThrow("persistent workflow failure");

    expect(getHubSpotWebhookEventForProcessing).toHaveBeenCalledTimes(3);
    expect(handleHubSpotWebhookEvent).toHaveBeenCalledTimes(3);
    expect(markHubSpotWebhookEventFailed).toHaveBeenCalledWith(
      "hubspot-event-fails-in-service",
    );
  });
});
