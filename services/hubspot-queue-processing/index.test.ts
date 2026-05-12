import { beforeEach, describe, expect, test, vi } from "vitest";

import { importWithRequiredEnv } from "@/tests/env";

const findUnique = vi.fn();
const updateMany = vi.fn();
const handleHubSpotWebhookEvent = vi.fn();

vi.mock("@/services/database", () => ({
  getPrismaClient: () => ({
    hubSpotWebhookEvent: {
      findUnique,
      updateMany,
    },
  }),
}));

vi.mock("@/services/hubspot-workflows", () => ({
  handleHubSpotWebhookEvent,
}));

describe("HubSpot queue processing service", () => {
  beforeEach(() => {
    findUnique.mockReset();
    updateMany.mockReset();
    handleHubSpotWebhookEvent.mockReset();
  });

  test("claims a HubSpot Webhook Processing Job, delegates the HubSpot workflow, and marks the event processed", async () => {
    updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    findUnique.mockResolvedValue({
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

    expect(updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: "hubspot-event-to-process",
        processingStatus: "NEW",
      },
      data: {
        processingStatus: "PROCESSING",
      },
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: {
        id: "hubspot-event-to-process",
      },
      select: {
        id: true,
        normalizedEvent: true,
        rawWebhook: true,
      },
    });
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
    expect(updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: "hubspot-event-to-process",
        processingStatus: "PROCESSING",
      },
      data: {
        processingStatus: "PROCESSED",
        processedAt: expect.any(Date),
      },
    });
  });

  test("skips HubSpot Webhook Processing Jobs when the event is no longer new", async () => {
    updateMany.mockResolvedValueOnce({ count: 0 });
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});
    const { processHubSpotWebhookProcessingJob } =
      await importWithRequiredEnv(() => import("./index"));

    await processHubSpotWebhookProcessingJob({
      hubSpotWebhookEventId: "already-claimed-event",
    });

    expect(findUnique).not.toHaveBeenCalled();
    expect(handleHubSpotWebhookEvent).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(consoleInfo).toHaveBeenCalledWith(
      "Skipped HubSpot Webhook Processing Job",
      {
        hubSpotWebhookEventId: "already-claimed-event",
        reason: "not_new",
      },
    );
  });

  test("retries HubSpot workflow handling internally before marking the event processed", async () => {
    updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    findUnique.mockResolvedValue({
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

    expect(findUnique).toHaveBeenCalledTimes(3);
    expect(handleHubSpotWebhookEvent).toHaveBeenCalledTimes(3);
    expect(updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: "hubspot-event-retried-in-service",
        processingStatus: "PROCESSING",
      },
      data: {
        processingStatus: "PROCESSED",
        processedAt: expect.any(Date),
      },
    });
  });

  test("marks the HubSpot Webhook Event failed when all processing attempts fail", async () => {
    updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    findUnique.mockResolvedValue({
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

    expect(findUnique).toHaveBeenCalledTimes(3);
    expect(handleHubSpotWebhookEvent).toHaveBeenCalledTimes(3);
    expect(updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: "hubspot-event-fails-in-service",
        processingStatus: "PROCESSING",
      },
      data: {
        processingStatus: "FAILED",
      },
    });
  });
});
