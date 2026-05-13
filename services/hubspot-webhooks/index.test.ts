import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createHmacSignature } from "@/lib/hmac-signature";
import { importWithRequiredEnv } from "@/tests/env";

const createMany = vi.fn();
const findMany = vi.fn();
const enqueueQueueJobWithRetries = vi.fn();

vi.mock("@/services/database", () => ({
  getPrismaClient: () => ({
    hubSpotWebhookEvent: {
      createMany,
      findMany,
    },
  }),
}));

vi.mock("@/services/queue", () => ({
  QUEUE_NAMES: {
    HUBSPOT_WEBHOOK_PROCESS: "hubspot.webhook.process",
  },
  enqueueQueueJobWithRetries,
}));

describe("HubSpot Webhooks service", () => {
  beforeEach(() => {
    createMany.mockReset();
    findMany.mockReset();
    enqueueQueueJobWithRetries.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Number("1710000000000") + 1_000));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("records contact creation HubSpot Webhook Events as new work for the worker", async () => {
    createMany.mockResolvedValue({ count: 1 });
    findMany.mockResolvedValue([
      {
        id: "hubspot-event-1",
      },
    ]);
    enqueueQueueJobWithRetries.mockResolvedValue(undefined);
    const { receiveHubSpotWebhookBatch } = await importWithRequiredEnv(() =>
      import("./index"),
    );
    const timestamp = "1710000000000";
    const rawEvents = [
      {
        appId: 456,
        eventId: 1001,
        objectId: 123,
        objectTypeId: "0-1",
        occurredAt: 1709999999000,
        portalId: 789,
        subscriptionId: 333,
        subscriptionType: "object.creation",
      },
    ];
    const rawBody = JSON.stringify(rawEvents);
    const signature = createHmacSignature({
      secret: "test-hubspot-client-secret",
      source: `POSThttps://desk.example.com/api/hubspot/webhook${rawBody}${timestamp}`,
    });
    vi.spyOn(console, "info").mockImplementation(() => {});

    const receipt = await receiveHubSpotWebhookBatch({
      method: "POST",
      rawBody,
      signature,
      timestamp,
      webhookUrl: "https://desk.example.com/api/hubspot/webhook",
    });

    expect(receipt.acceptedEventCount).toBe(1);
    expect(receipt.persistedEventCount).toBe(1);
    expect(receipt.enqueuedProcessingJobCount).toBe(1);
    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          normalizedEvent: {
            type: "contact.created",
            hubSpotObjectId: "123",
            hubSpotPortalId: "789",
            occurredAt: "2024-03-09T15:59:59.000Z",
          },
          processingStatus: "NEW",
          rawWebhook: rawEvents[0],
          processedAt: null,
        }),
      ],
      skipDuplicates: true,
    });
    expect(enqueueQueueJobWithRetries).toHaveBeenCalledWith({
      queueName: "hubspot.webhook.process",
      jobName: "hubspot.webhook.process",
      data: { hubSpotWebhookEventId: "hubspot-event-1" },
      jobOptions: {
        jobId: "hubspot-webhook-event-hubspot-event-1",
      },
    });
  });

  test("records conversation new MESSAGE HubSpot Webhook Events as new work for the worker", async () => {
    createMany.mockResolvedValue({ count: 1 });
    findMany.mockResolvedValue([
      {
        id: "hubspot-event-2",
      },
    ]);
    enqueueQueueJobWithRetries.mockResolvedValue(undefined);
    const { receiveHubSpotWebhookBatch } = await importWithRequiredEnv(() =>
      import("./index"),
    );
    const timestamp = "1710000000000";
    const rawEvents = [
      {
        eventId: 1002,
        messageId: 555,
        messageType: "MESSAGE",
        objectId: 321,
        occurredAt: 1709999999000,
        portalId: 789,
        subscriptionId: 334,
        subscriptionType: "conversation.newMessage",
      },
    ];
    const rawBody = JSON.stringify(rawEvents);
    const signature = createHmacSignature({
      secret: "test-hubspot-client-secret",
      source: `POSThttps://desk.example.com/api/hubspot/webhook${rawBody}${timestamp}`,
    });
    vi.spyOn(console, "info").mockImplementation(() => {});

    const receipt = await receiveHubSpotWebhookBatch({
      method: "POST",
      rawBody,
      signature,
      timestamp,
      webhookUrl: "https://desk.example.com/api/hubspot/webhook",
    });

    expect(receipt.persistedEventCount).toBe(1);
    expect(receipt.enqueuedProcessingJobCount).toBe(1);
    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          normalizedEvent: {
            type: "conversation.message.received",
            hubSpotObjectId: "321",
            hubSpotPortalId: "789",
            occurredAt: "2024-03-09T15:59:59.000Z",
            hubSpotMessageId: "555",
          },
          processingStatus: "NEW",
          rawWebhook: rawEvents[0],
        }),
      ],
      skipDuplicates: true,
    });
  });

  test("does not record non-target HubSpot Webhook Events", async () => {
    const { receiveHubSpotWebhookBatch } = await importWithRequiredEnv(() =>
      import("./index"),
    );
    const timestamp = "1710000000000";
    const rawEvents = [
      {
        eventId: 1003,
        objectId: 123,
        objectTypeId: "0-1",
        subscriptionType: "object.propertyChange",
      },
      {
        eventId: 1004,
        objectId: 456,
        objectTypeId: "0-2",
        subscriptionType: "object.creation",
      },
      {
        eventId: 1005,
        messageId: 556,
        messageType: "COMMENT",
        objectId: 321,
        subscriptionType: "conversation.newMessage",
      },
    ];
    const rawBody = JSON.stringify(rawEvents);
    const signature = createHmacSignature({
      secret: "test-hubspot-client-secret",
      source: `POSThttps://desk.example.com/api/hubspot/webhook${rawBody}${timestamp}`,
    });
    vi.spyOn(console, "info").mockImplementation(() => {});

    const receipt = await receiveHubSpotWebhookBatch({
      method: "POST",
      rawBody,
      signature,
      timestamp,
      webhookUrl: "https://desk.example.com/api/hubspot/webhook",
    });

    expect(receipt.acceptedEventCount).toBe(3);
    expect(receipt.persistedEventCount).toBe(0);
    expect(createMany).not.toHaveBeenCalled();
  });

  test("enqueues processing for duplicate HubSpot Webhook Events that are still new", async () => {
    createMany.mockResolvedValue({ count: 0 });
    findMany.mockResolvedValue([
      {
        id: "existing-new-hubspot-event",
      },
    ]);
    enqueueQueueJobWithRetries.mockResolvedValue(undefined);
    const { receiveHubSpotWebhookBatch } = await importWithRequiredEnv(() =>
      import("./index"),
    );
    const timestamp = "1710000000000";
    const rawEvents = [
      {
        appId: 456,
        eventId: 1001,
        objectId: 123,
        objectTypeId: "0-1",
        occurredAt: 1709999999000,
        portalId: 789,
        subscriptionId: 333,
        subscriptionType: "object.creation",
      },
    ];
    const rawBody = JSON.stringify(rawEvents);
    const signature = createHmacSignature({
      secret: "test-hubspot-client-secret",
      source: `POSThttps://desk.example.com/api/hubspot/webhook${rawBody}${timestamp}`,
    });
    vi.spyOn(console, "info").mockImplementation(() => {});

    const receipt = await receiveHubSpotWebhookBatch({
      method: "POST",
      rawBody,
      signature,
      timestamp,
      webhookUrl: "https://desk.example.com/api/hubspot/webhook",
    });

    expect(receipt.persistedEventCount).toBe(0);
    expect(receipt.enqueuedProcessingJobCount).toBe(1);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        dedupeKey: {
          in: [expect.any(String)],
        },
        processingStatus: "NEW",
      },
      select: {
        id: true,
      },
    });
    expect(enqueueQueueJobWithRetries).toHaveBeenCalledWith({
      queueName: "hubspot.webhook.process",
      jobName: "hubspot.webhook.process",
      data: { hubSpotWebhookEventId: "existing-new-hubspot-event" },
      jobOptions: {
        jobId: "hubspot-webhook-event-existing-new-hubspot-event",
      },
    });
  });

  test("surfaces HubSpot Webhook Processing Job enqueue failures after retries are exhausted", async () => {
    createMany.mockResolvedValue({ count: 1 });
    findMany.mockResolvedValue([
      {
        id: "hubspot-event-enqueue-failure",
      },
    ]);
    enqueueQueueJobWithRetries.mockRejectedValue(new Error("redis unavailable"));
    const { receiveHubSpotWebhookBatch } = await importWithRequiredEnv(() =>
      import("./index"),
    );
    const timestamp = "1710000000000";
    const rawEvents = [
      {
        appId: 456,
        eventId: 1001,
        objectId: 123,
        objectTypeId: "0-1",
        occurredAt: 1709999999000,
        portalId: 789,
        subscriptionId: 333,
        subscriptionType: "object.creation",
      },
    ];
    const rawBody = JSON.stringify(rawEvents);
    const signature = createHmacSignature({
      secret: "test-hubspot-client-secret",
      source: `POSThttps://desk.example.com/api/hubspot/webhook${rawBody}${timestamp}`,
    });
    vi.spyOn(console, "info").mockImplementation(() => {});

    await expect(
      receiveHubSpotWebhookBatch({
        method: "POST",
        rawBody,
        signature,
        timestamp,
        webhookUrl: "https://desk.example.com/api/hubspot/webhook",
        }),
    ).rejects.toThrow("redis unavailable");
    expect(enqueueQueueJobWithRetries).toHaveBeenCalledTimes(1);
  });

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
    });

    expect(receipt.events).toEqual(rawEvents);
    expect(consoleInfo).toHaveBeenCalledWith(
      "Accepted HubSpot Webhook Batch",
      {
        eventCount: 2,
        persistedEventCount: 0,
        enqueuedProcessingJobCount: 0,
      },
    );
  });

  test("rejects requests missing the HubSpot signature header as unauthenticated", async () => {
    const { receiveHubSpotWebhookBatch, HubSpotWebhookReceiptError } =
      await importWithRequiredEnv(() => import("./index"));
    const timestamp = "1710000000000";
    const rawBody = JSON.stringify([{ eventId: 1001 }]);
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});

    await expect(
      receiveHubSpotWebhookBatch({
        method: "POST",
        rawBody,
        signature: null,
        timestamp,
        webhookUrl: "https://desk.example.com/api/hubspot/webhook",
        }),
    ).rejects.toMatchObject({
      constructor: HubSpotWebhookReceiptError,
      reason: "unauthorized",
    });
    expect(consoleInfo).not.toHaveBeenCalled();
  });

  test("rejects requests missing the HubSpot timestamp header as unauthenticated", async () => {
    const { receiveHubSpotWebhookBatch, HubSpotWebhookReceiptError } =
      await importWithRequiredEnv(() => import("./index"));
    const timestamp = "1710000000000";
    const rawBody = JSON.stringify([{ eventId: 1001 }]);
    const signature = createHmacSignature({
      secret: "test-hubspot-client-secret",
      source: `POSThttps://desk.example.com/api/hubspot/webhook${rawBody}${timestamp}`,
    });
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});

    await expect(
      receiveHubSpotWebhookBatch({
        method: "POST",
        rawBody,
        signature,
        timestamp: null,
        webhookUrl: "https://desk.example.com/api/hubspot/webhook",
        }),
    ).rejects.toMatchObject({
      constructor: HubSpotWebhookReceiptError,
      reason: "unauthorized",
    });
    expect(consoleInfo).not.toHaveBeenCalled();
  });

  test("rejects requests with an invalid HubSpot v3 signature as unauthenticated", async () => {
    const { receiveHubSpotWebhookBatch, HubSpotWebhookReceiptError } =
      await importWithRequiredEnv(() => import("./index"));
    const timestamp = "1710000000000";
    const rawBody = JSON.stringify([{ eventId: 1001 }]);
    const wrongSignature = createHmacSignature({
      secret: "not-the-real-secret",
      source: `POSThttps://desk.example.com/api/hubspot/webhook${rawBody}${timestamp}`,
    });
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});

    await expect(
      receiveHubSpotWebhookBatch({
        method: "POST",
        rawBody,
        signature: wrongSignature,
        timestamp,
        webhookUrl: "https://desk.example.com/api/hubspot/webhook",
        }),
    ).rejects.toMatchObject({
      constructor: HubSpotWebhookReceiptError,
      reason: "unauthorized",
    });
    expect(consoleInfo).not.toHaveBeenCalled();
  });

  test("rejects requests with a stale HubSpot timestamp as unauthenticated", async () => {
    const { receiveHubSpotWebhookBatch, HubSpotWebhookReceiptError } =
      await importWithRequiredEnv(() => import("./index"));
    const timestamp = "1710000000000";
    const rawBody = JSON.stringify([{ eventId: 1001 }]);
    const signature = createHmacSignature({
      secret: "test-hubspot-client-secret",
      source: `POSThttps://desk.example.com/api/hubspot/webhook${rawBody}${timestamp}`,
    });
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.setSystemTime(new Date(Number(timestamp) + 5 * 60 * 1000 + 1));

    await expect(
      receiveHubSpotWebhookBatch({
        method: "POST",
        rawBody,
        signature,
        timestamp,
        webhookUrl: "https://desk.example.com/api/hubspot/webhook",
      }),
    ).rejects.toMatchObject({
      constructor: HubSpotWebhookReceiptError,
      reason: "unauthorized",
    });
    expect(consoleInfo).not.toHaveBeenCalled();
  });

  test("rejects authenticated requests with malformed JSON as a bad payload", async () => {
    const { receiveHubSpotWebhookBatch, HubSpotWebhookReceiptError } =
      await importWithRequiredEnv(() => import("./index"));
    const timestamp = "1710000000000";
    const rawBody = "{not valid json";
    const signature = createHmacSignature({
      secret: "test-hubspot-client-secret",
      source: `POSThttps://desk.example.com/api/hubspot/webhook${rawBody}${timestamp}`,
    });
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});

    await expect(
      receiveHubSpotWebhookBatch({
        method: "POST",
        rawBody,
        signature,
        timestamp,
        webhookUrl: "https://desk.example.com/api/hubspot/webhook",
        }),
    ).rejects.toMatchObject({
      constructor: HubSpotWebhookReceiptError,
      reason: "bad_request",
    });
    expect(consoleInfo).not.toHaveBeenCalled();
  });

  test("rejects authenticated requests whose JSON body is not an array as a bad payload", async () => {
    const { receiveHubSpotWebhookBatch, HubSpotWebhookReceiptError } =
      await importWithRequiredEnv(() => import("./index"));
    const timestamp = "1710000000000";
    const rawBody = JSON.stringify({ eventId: 1001 });
    const signature = createHmacSignature({
      secret: "test-hubspot-client-secret",
      source: `POSThttps://desk.example.com/api/hubspot/webhook${rawBody}${timestamp}`,
    });
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});

    await expect(
      receiveHubSpotWebhookBatch({
        method: "POST",
        rawBody,
        signature,
        timestamp,
        webhookUrl: "https://desk.example.com/api/hubspot/webhook",
        }),
    ).rejects.toMatchObject({
      constructor: HubSpotWebhookReceiptError,
      reason: "bad_request",
    });
    expect(consoleInfo).not.toHaveBeenCalled();
  });

  test("rejects authenticated requests with an empty array body as a bad payload", async () => {
    const { receiveHubSpotWebhookBatch, HubSpotWebhookReceiptError } =
      await importWithRequiredEnv(() => import("./index"));
    const timestamp = "1710000000000";
    const rawBody = JSON.stringify([]);
    const signature = createHmacSignature({
      secret: "test-hubspot-client-secret",
      source: `POSThttps://desk.example.com/api/hubspot/webhook${rawBody}${timestamp}`,
    });
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});

    await expect(
      receiveHubSpotWebhookBatch({
        method: "POST",
        rawBody,
        signature,
        timestamp,
        webhookUrl: "https://desk.example.com/api/hubspot/webhook",
        }),
    ).rejects.toMatchObject({
      constructor: HubSpotWebhookReceiptError,
      reason: "bad_request",
    });
    expect(consoleInfo).not.toHaveBeenCalled();
  });

  test("rejects authenticated requests whose array contains non-object entries as a bad payload", async () => {
    const { receiveHubSpotWebhookBatch, HubSpotWebhookReceiptError } =
      await importWithRequiredEnv(() => import("./index"));
    const timestamp = "1710000000000";
    const rawBody = JSON.stringify([{ eventId: 1001 }, "not-an-object"]);
    const signature = createHmacSignature({
      secret: "test-hubspot-client-secret",
      source: `POSThttps://desk.example.com/api/hubspot/webhook${rawBody}${timestamp}`,
    });
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});

    await expect(
      receiveHubSpotWebhookBatch({
        method: "POST",
        rawBody,
        signature,
        timestamp,
        webhookUrl: "https://desk.example.com/api/hubspot/webhook",
        }),
    ).rejects.toMatchObject({
      constructor: HubSpotWebhookReceiptError,
      reason: "bad_request",
    });
    expect(consoleInfo).not.toHaveBeenCalled();
  });
});
