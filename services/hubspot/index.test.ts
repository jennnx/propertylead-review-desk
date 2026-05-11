import { describe, expect, test, vi } from "vitest";

import { createHmacSignature } from "@/lib/hmac-signature";
import { importWithRequiredEnv } from "@/tests/env";

describe("HubSpot Integration service", () => {
  test("derives the HubSpot Webhook URL from the app base URL and route path", async () => {
    const { getHubSpotWebhookUrl, HUBSPOT_WEBHOOK_ROUTE_PATH } =
      await importWithRequiredEnv(() => import("./index"));

    expect(HUBSPOT_WEBHOOK_ROUTE_PATH).toBe("/api/hubspot/webhook");
    expect(getHubSpotWebhookUrl()).toBe(
      "https://desk.example.com/api/hubspot/webhook",
    );
  });

  test("derives the same HubSpot Webhook URL when the app base URL has a trailing slash", async () => {
    const { deriveHubSpotWebhookUrl } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    expect(deriveHubSpotWebhookUrl("https://desk.example.com/")).toBe(
      "https://desk.example.com/api/hubspot/webhook",
    );
  });

  test("accepts a valid signed HubSpot Webhook Batch with multiple raw HubSpot Webhook Events", async () => {
    const { receiveHubSpotWebhookBatch } = await importWithRequiredEnv(() =>
      import("./index"),
    );
    const timestamp = "1710000000000";
    const rawEvents = [
      { eventId: 1001, subscriptionType: "contact.creation" },
      {
        eventId: 1002,
        subscriptionType: "contact.propertyChange",
        propertyName: "email",
      },
    ];
    const rawBody = JSON.stringify(rawEvents);
    const signature = createHmacSignature({
      secret: "test-hubspot-client-secret",
      source: `POSThttps://desk.example.com/api/hubspot/webhook${rawBody}${timestamp}`,
    });
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});

    const receipt = await receiveHubSpotWebhookBatch({
      method: "POST",
      rawBody,
      signature,
      timestamp,
      webhookUrl: "https://desk.example.com/api/hubspot/webhook",
      now: new Date(Number(timestamp) + 1_000),
    });

    expect(receipt.events).toEqual(rawEvents);
    expect(consoleInfo).toHaveBeenCalledWith(
      "Accepted HubSpot Webhook Batch",
      { eventCount: 2 },
    );
  });
});
