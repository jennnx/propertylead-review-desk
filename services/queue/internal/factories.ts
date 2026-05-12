import { Queue, QueueEvents, Worker, type Processor } from "bullmq";

import { createRedisConnection } from "./connection";

export const QUEUE_NAMES = {
  HUBSPOT_WEBHOOK_PROCESS: "hubspot.webhook.process",
  INFRA_SMOKE: "infra.smoke",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export function createQueue<T = unknown, R = unknown, N extends string = string>(
  name: N,
): Queue<T, R, N> {
  return new Queue<T, R, N>(name, { connection: createRedisConnection() });
}

export function createWorker<T = unknown, R = unknown, N extends string = string>(
  name: N,
  processor: Processor<T, R, N>,
): Worker<T, R, N> {
  return new Worker<T, R, N>(name, processor, { connection: createRedisConnection() });
}

export function createQueueEvents(name: string): QueueEvents {
  return new QueueEvents(name, { connection: createRedisConnection() });
}
