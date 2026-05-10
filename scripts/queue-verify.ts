// Post-deploy queue verification.
//
// Connects to the live BullMQ queue, enqueues an `infra.smoke` job,
// waits for completion using `Job.waitUntilFinished(queueEvents, ttl)`
// with an explicit timeout, asserts the structured result, and exits
// non-zero on timeout or job failure.
//
// This is the ONLY caller of `waitUntilFinished` in the codebase —
// production request paths must not block on background job completion
// (see PRD #1, decision under "Testing Decisions").

import {
  QUEUE_NAMES,
  createQueue,
  createQueueEvents,
} from "@/services/queue";
import type { InfraSmokeResult } from "@/worker/jobs/infra-smoke";

const DEFAULT_TIMEOUT_MS = 30_000;

function parseTimeout(): number {
  const raw = process.env.QUEUE_VERIFY_TIMEOUT_MS;
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `QUEUE_VERIFY_TIMEOUT_MS must be a positive number, got: ${raw}`,
    );
  }
  return parsed;
}

async function main(): Promise<number> {
  const timeoutMs = parseTimeout();
  const infraSmokeName = QUEUE_NAMES.INFRA_SMOKE;
  const queue = createQueue<Record<string, never>, InfraSmokeResult, typeof infraSmokeName>(
    infraSmokeName,
  );
  const queueEvents = createQueueEvents(infraSmokeName);

  try {
    // Wait for QueueEvents to subscribe before enqueuing — otherwise a
    // very fast worker could complete the job before we are listening.
    await queueEvents.waitUntilReady();

    const job = await queue.add(infraSmokeName, {});
    console.log(
      `queue: enqueued ${infraSmokeName} job ${job.id}, waiting up to ${timeoutMs}ms for completion...`,
    );

    let result: InfraSmokeResult;
    try {
      result = await job.waitUntilFinished(queueEvents, timeoutMs);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `queue: job ${job.id} did not complete successfully — ${message}`,
      );
      return 1;
    }

    const lines = Object.entries(result.checks).map(([name, check]) => {
      return `${name.padEnd(9)} : ${check.ok ? "ok" : `FAIL — ${check.error}`}`;
    });
    console.log(lines.join("\n"));
    console.log(
      `worker    : pid=${result.worker.pid} node=${result.worker.node} platform=${result.worker.platform}`,
    );
    console.log(
      `job       : ${result.jobId} (started ${result.startedAt}, completed ${result.completedAt})`,
    );
    console.log(`status    : ${result.ok ? "ok" : "fail"}`);

    return result.ok ? 0 : 1;
  } finally {
    await queueEvents.close();
    await queue.close();
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
