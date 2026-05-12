import { beforeEach, describe, expect, test, vi } from "vitest";

import type { Job } from "../../services/queue";

const claimHubSpotWebhookEventForProcessing = vi.fn();
const getHubSpotWebhookEventForProcessing = vi.fn();
const markHubSpotWebhookEventFailed = vi.fn();
const markHubSpotWebhookEventProcessed = vi.fn();

vi.mock("../../services/hubspot", () => ({
  claimHubSpotWebhookEventForProcessing,
  getHubSpotWebhookEventForProcessing,
  markHubSpotWebhookEventFailed,
  markHubSpotWebhookEventProcessed,
}));

describe("HubSpot Webhook Processing Job", () => {
  beforeEach(() => {
    claimHubSpotWebhookEventForProcessing.mockReset();
    getHubSpotWebhookEventForProcessing.mockReset();
    markHubSpotWebhookEventFailed.mockReset();
    markHubSpotWebhookEventProcessed.mockReset();
  });

  test("logs the event payload and marks the event processed", async () => {
    claimHubSpotWebhookEventForProcessing.mockResolvedValue(true);
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
    markHubSpotWebhookEventProcessed.mockResolvedValue(undefined);
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});
    const { processHubSpotWebhookProcess } = await import("./hubspot-webhook-process");

    await processHubSpotWebhookProcess(
      createJob("hubspot-event-to-process"),
    );

    expect(claimHubSpotWebhookEventForProcessing).toHaveBeenCalledWith(
      "hubspot-event-to-process",
    );
    expect(consoleInfo).toHaveBeenCalledWith("Processing HubSpot Webhook Event", {
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

  test("skips the job when the event is no longer new", async () => {
    claimHubSpotWebhookEventForProcessing.mockResolvedValue(false);
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});
    const { processHubSpotWebhookProcess } = await import("./hubspot-webhook-process");

    await processHubSpotWebhookProcess(createJob("already-claimed-event"));

    expect(getHubSpotWebhookEventForProcessing).not.toHaveBeenCalled();
    expect(markHubSpotWebhookEventProcessed).not.toHaveBeenCalled();
    expect(consoleInfo).toHaveBeenCalledWith(
      "Skipped HubSpot Webhook Processing Job",
      {
        hubSpotWebhookEventId: "already-claimed-event",
        reason: "not_new",
      },
    );
  });

  test("retries the placeholder action internally before marking the event processed", async () => {
    claimHubSpotWebhookEventForProcessing.mockResolvedValue(true);
    getHubSpotWebhookEventForProcessing
      .mockRejectedValueOnce(new Error("temporary read failure"))
      .mockRejectedValueOnce(new Error("second temporary read failure"))
      .mockResolvedValueOnce({
        id: "hubspot-event-retried-in-worker",
        normalizedEvent: {
          type: "contact.created",
          hubSpotObjectId: "123",
        },
        rawWebhook: {
          eventId: 1001,
        },
      });
    markHubSpotWebhookEventProcessed.mockResolvedValue(undefined);
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { processHubSpotWebhookProcess } = await import("./hubspot-webhook-process");

    await processHubSpotWebhookProcess(
      createJob("hubspot-event-retried-in-worker"),
    );

    expect(getHubSpotWebhookEventForProcessing).toHaveBeenCalledTimes(3);
    expect(markHubSpotWebhookEventProcessed).toHaveBeenCalledWith(
      "hubspot-event-retried-in-worker",
      expect.any(Date),
    );
  });

  test("marks the event failed when all internal processing attempts fail", async () => {
    claimHubSpotWebhookEventForProcessing.mockResolvedValue(true);
    getHubSpotWebhookEventForProcessing.mockRejectedValue(
      new Error("persistent read failure"),
    );
    markHubSpotWebhookEventFailed.mockResolvedValue(undefined);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { processHubSpotWebhookProcess } = await import("./hubspot-webhook-process");

    await expect(
      processHubSpotWebhookProcess(createJob("hubspot-event-fails-in-worker")),
    ).rejects.toThrow("persistent read failure");

    expect(getHubSpotWebhookEventForProcessing).toHaveBeenCalledTimes(3);
    expect(markHubSpotWebhookEventFailed).toHaveBeenCalledWith(
      "hubspot-event-fails-in-worker",
    );
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
