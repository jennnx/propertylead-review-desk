import { beforeEach, describe, expect, test, vi } from "vitest";

import { importWithRequiredEnv } from "@/tests/env";

const queueAdd = vi.fn();
const queueClose = vi.fn();

vi.mock("bullmq", () => ({
  Queue: vi.fn(function Queue() {
    return {
      add: queueAdd,
      close: queueClose,
    };
  }),
  QueueEvents: vi.fn(function QueueEvents() {
    return {};
  }),
  Worker: vi.fn(function Worker() {
    return {};
  }),
}));

vi.mock("ioredis", () => ({
  Redis: vi.fn(function Redis() {
    return {};
  }),
}));

describe("Queue service", () => {
  beforeEach(() => {
    queueAdd.mockReset();
    queueClose.mockReset();
    queueClose.mockResolvedValue(undefined);
  });

  test("enqueues a job with retries", async () => {
    queueAdd
      .mockRejectedValueOnce(new Error("redis unavailable"))
      .mockRejectedValueOnce(new Error("redis still unavailable"))
      .mockResolvedValueOnce({});
    const { enqueueQueueJobWithRetries } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    await enqueueQueueJobWithRetries({
      queueName: "hubspot.webhook.process",
      jobName: "hubspot.webhook.process",
      data: {
        hubSpotWebhookEventId: "hubspot-event-retry",
      },
      jobOptions: {
        jobId: "hubspot-webhook-event:hubspot-event-retry",
      },
      enqueueAttempts: 3,
      retryDelayMs: 0,
    });

    expect(queueAdd).toHaveBeenCalledTimes(3);
    expect(queueAdd).toHaveBeenLastCalledWith(
      "hubspot.webhook.process",
      {
        hubSpotWebhookEventId: "hubspot-event-retry",
      },
      {
        jobId: "hubspot-webhook-event:hubspot-event-retry",
      },
    );
    expect(queueClose).toHaveBeenCalledTimes(1);
  });

  test("surfaces the final enqueue failure after retries are exhausted", async () => {
    queueAdd.mockRejectedValue(new Error("redis unavailable"));
    const { enqueueQueueJobWithRetries } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    await expect(
      enqueueQueueJobWithRetries({
        queueName: "hubspot.webhook.process",
        jobName: "hubspot.webhook.process",
        data: {
          hubSpotWebhookEventId: "hubspot-event-enqueue-failure",
        },
        enqueueAttempts: 3,
        retryDelayMs: 0,
      }),
    ).rejects.toThrow("redis unavailable");

    expect(queueAdd).toHaveBeenCalledTimes(3);
    expect(queueClose).toHaveBeenCalledTimes(1);
  });
});
