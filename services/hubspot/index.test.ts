import { describe, expect, test } from "vitest";

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
});
