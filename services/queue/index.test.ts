import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

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

  afterEach(() => {
    vi.useRealTimers();
  });

  test("enqueues a job, retrying up to 3 times across transient enqueue failures", async () => {
    queueAdd
      .mockRejectedValueOnce(new Error("redis unavailable"))
      .mockRejectedValueOnce(new Error("redis still unavailable"))
      .mockResolvedValueOnce({});
    vi.useFakeTimers();
    const { enqueueQueueJobWithRetries } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    const promise = enqueueQueueJobWithRetries({
      queueName: "hubspot.webhook.process",
      jobName: "hubspot.webhook.process",
      data: {
        hubSpotWebhookEventId: "hubspot-event-retry",
      },
      jobOptions: {
        jobId: "hubspot-webhook-event:hubspot-event-retry",
      },
    });
    await vi.runAllTimersAsync();
    await promise;

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
    vi.useFakeTimers();
    const { enqueueQueueJobWithRetries } = await importWithRequiredEnv(() =>
      import("./index"),
    );

    const promise = enqueueQueueJobWithRetries({
      queueName: "hubspot.webhook.process",
      jobName: "hubspot.webhook.process",
      data: {
        hubSpotWebhookEventId: "hubspot-event-enqueue-failure",
      },
    });
    const assertion = expect(promise).rejects.toThrow("redis unavailable");
    await vi.runAllTimersAsync();
    await assertion;

    expect(queueAdd).toHaveBeenCalledTimes(3);
    expect(queueClose).toHaveBeenCalledTimes(1);
  });

  test("exposes the SOP ingestion queue name", async () => {
    const { QUEUE_NAMES } = await importWithRequiredEnv(() => import("./index"));

    expect(QUEUE_NAMES.SOP_INGEST).toBe("sop.ingest");
  });
});
