import { describe, expect, test, vi } from "vitest";

describe("HubSpot workflows service", () => {
  test("handles a HubSpot Webhook Event with the current placeholder implementation", async () => {
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});
    const { handleHubSpotWebhookEvent } = await import("./index");

    await handleHubSpotWebhookEvent({
      normalizedEvent: {
        type: "contact.created",
        hubSpotObjectId: "123",
      },
      rawWebhook: {
        eventId: 1001,
      },
    });

    expect(consoleInfo).toHaveBeenCalledWith("Processing HubSpot Webhook Event", {
      normalizedEvent: {
        type: "contact.created",
        hubSpotObjectId: "123",
      },
      rawWebhook: {
        eventId: 1001,
      },
    });
  });
});
