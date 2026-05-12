import { beforeEach, describe, expect, test, vi } from "vitest";

const upsert = vi.fn();
const update = vi.fn();

vi.mock("@/services/database", () => ({
  getPrismaClient: () => ({
    hubSpotWorkflowRun: {
      upsert,
      update,
    },
  }),
}));

describe("HubSpot workflows service", () => {
  beforeEach(() => {
    upsert.mockReset();
    update.mockReset();
  });

  test("records a successful HubSpot Workflow Run for a target HubSpot Webhook Event", async () => {
    upsert.mockResolvedValue({ id: "workflow-run-1" });
    update.mockResolvedValue({});
    const { handleHubSpotWebhookEvent } = await import("./index");

    await handleHubSpotWebhookEvent({
      hubSpotWebhookEventId: "hubspot-event-1",
      normalizedEvent: {
        type: "contact.created",
        hubSpotObjectId: "123",
      },
      rawWebhook: {
        eventId: 1001,
      },
    });

    expect(upsert).toHaveBeenCalledWith({
      where: {
        hubSpotWebhookEventId: "hubspot-event-1",
      },
      create: {
        hubSpotWebhookEventId: "hubspot-event-1",
        status: "IN_PROGRESS",
      },
      update: {
        status: "IN_PROGRESS",
        outcome: null,
        failureMessage: null,
        completedAt: null,
      },
      select: {
        id: true,
      },
    });
    expect(update).toHaveBeenCalledWith({
      where: {
        id: "workflow-run-1",
      },
      data: {
        status: "SUCCEEDED",
        outcome: "NO_WRITEBACK_NEEDED",
        completedAt: expect.any(Date),
      },
    });
  });

  test("marks the HubSpot Workflow Run failed when workflow processing fails", async () => {
    upsert.mockResolvedValue({ id: "workflow-run-1" });
    update.mockResolvedValue({});
    const { handleHubSpotWebhookEvent } = await import("./index");

    await expect(
      handleHubSpotWebhookEvent({
        hubSpotWebhookEventId: "hubspot-event-1",
        normalizedEvent: {
          type: "unsupported.event",
          hubSpotObjectId: "123",
        },
        rawWebhook: {
          eventId: 1001,
        },
      }),
    ).rejects.toThrow("Unsupported HubSpot Workflow Event");

    expect(update).toHaveBeenCalledWith({
      where: {
        id: "workflow-run-1",
      },
      data: {
        status: "FAILED",
        outcome: null,
        failureMessage: "Unsupported HubSpot Workflow Event: unsupported.event",
        completedAt: expect.any(Date),
      },
    });
  });
});
