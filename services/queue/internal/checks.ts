import type { Queue } from "bullmq";
import type { Redis } from "ioredis";

export type CheckResult = { ok: true } | { ok: false; error: string };

export async function checkRedisReachable(connection: Redis): Promise<CheckResult> {
  try {
    const pong = await connection.ping();
    if (pong !== "PONG") {
      return { ok: false, error: `unexpected PING response: ${pong}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function checkQueueInspectable(queue: Queue): Promise<CheckResult> {
  try {
    await queue.getJobCounts();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
