import { describe, expect, test, vi } from "vitest";

import { createHmacSignature } from "@/lib/hmac-signature";
import { importWithRequiredEnv } from "@/tests/env";

describe("HubSpot webhook route", () => {
  test("accepts a valid signed HubSpot Webhook Batch", async () => {
    const { POST } = await importWithRequiredEnv(() => import("./route"));
    const rawBody = JSON.stringify([
      { eventId: 1001, subscriptionType: "contact.creation" },
      { eventId: 1002, subscriptionType: "contact.propertyChange" },
    ]);
    const timestamp = Date.now().toString();
    const signature = createHmacSignature({
      secret: "test-hubspot-client-secret",
      source: `POSThttps://desk.example.com/api/hubspot/webhook${rawBody}${timestamp}`,
    });
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

    await expect(response.text()).resolves.toBe("");
    expect(response.status).toBe(204);
  });
});
