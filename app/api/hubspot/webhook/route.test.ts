import { createHmac } from "node:crypto";

import { describe, expect, test, vi } from "vitest";

import { importWithRequiredEnv } from "@/tests/env";

describe("HubSpot webhook route", () => {
  test("accepts a valid signed HubSpot Webhook Batch", async () => {
    const { POST } = await importWithRequiredEnv(() => import("./route"));
    const rawBody = JSON.stringify([
      { eventId: 1001, subscriptionType: "contact.creation" },
      { eventId: 1002, subscriptionType: "contact.propertyChange" },
    ]);
    const timestamp = Date.now().toString();
    const signature = createHmac("sha256", "test-hubspot-client-secret")
      .update(
        `POSThttps://desk.example.com/api/hubspot/webhook${rawBody}${timestamp}`,
        "utf8",
      )
      .digest("base64");
    vi.spyOn(console, "info").mockImplementation(() => {});

    const response = await POST(
      new Request("https://proxy.example.test/api/hubspot/webhook", {
        method: "POST",
        body: rawBody,
        headers: {
          "x-hubspot-request-timestamp": timestamp,
          "x-hubspot-signature-v3": signature,
        },
      }),
    );

    await expect(response.json()).resolves.toEqual({
      acceptedEvents: 2,
      ok: true,
    });
    expect(response.status).toBe(200);
  });
});
