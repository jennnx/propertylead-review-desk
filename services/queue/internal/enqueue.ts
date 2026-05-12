import type { JobsOptions } from "bullmq";

import { createQueue } from "./factories";

export type EnqueueQueueJobInput<TData, TName extends string> = {
  queueName: TName;
  jobName: TName;
  data: TData;
  jobOptions?: JobsOptions;
  enqueueAttempts?: number;
  retryDelayMs?: number;
};

const DEFAULT_ENQUEUE_ATTEMPTS = 1;
const DEFAULT_RETRY_DELAY_MS = 50;

export async function enqueueQueueJobWithRetries<
  TData,
  TName extends string,
>({
  queueName,
  jobName,
  data,
  jobOptions,
  enqueueAttempts = DEFAULT_ENQUEUE_ATTEMPTS,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
}: EnqueueQueueJobInput<TData, TName>): Promise<void> {
  const queue = createQueue<TData, void, string>(queueName);
  const addJob = queue.add.bind(queue) as (
    name: string,
    data: TData,
    opts?: JobsOptions,
  ) => Promise<unknown>;
  let lastError: unknown;

  try {
    for (let attempt = 1; attempt <= enqueueAttempts; attempt++) {
      try {
        await addJob(jobName, data, jobOptions);
        return;
      } catch (error) {
        lastError = error;
        if (attempt < enqueueAttempts) {
          await sleep(retryDelayMs);
        }
      }
    }

    throw lastError;
  } finally {
    await queue.close();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
