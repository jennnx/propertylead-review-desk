import type { JobsOptions } from "bullmq";

import { createQueue } from "./factories";

export type EnqueueQueueJobInput<TData, TName extends string> = {
  queueName: TName;
  jobName: TName;
  data: TData;
  jobOptions?: JobsOptions;
};

const ENQUEUE_ATTEMPTS = 3;
const RETRY_DELAY_MS = 50;

export async function enqueueQueueJobWithRetries<
  TData,
  TName extends string,
>({
  queueName,
  jobName,
  data,
  jobOptions,
}: EnqueueQueueJobInput<TData, TName>): Promise<void> {
  const queue = createQueue<TData, void, string>(queueName);
  const addJob = queue.add.bind(queue) as (
    name: string,
    data: TData,
    opts?: JobsOptions,
  ) => Promise<unknown>;
  let lastError: unknown;

  try {
    for (let attempt = 1; attempt <= ENQUEUE_ATTEMPTS; attempt++) {
      try {
        await addJob(jobName, data, jobOptions);
        return;
      } catch (error) {
        lastError = error;
        if (attempt < ENQUEUE_ATTEMPTS) {
          await sleep(RETRY_DELAY_MS);
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
