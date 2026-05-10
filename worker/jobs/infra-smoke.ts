// `infra.smoke` job processor.
//
// Permanent, harmless diagnostic that exercises the worker-side runtime
// path: Redis access through the queue service, Postgres reachability
// through Prisma, and the pgvector extension. Returns a structured
// payload so verification scripts can assert per-check results. The job
// does not call CRM, Claude, PromptFoo, or any future business
// integration, and does not write to product/domain tables.

import {
  checkDatabaseReachable,
  checkPgvectorInstalled,
  getPrismaClient,
  type CheckResult as DatabaseCheck,
} from "../../services/database";
import {
  checkRedisReachable,
  createRedisConnection,
  type CheckResult as QueueCheck,
  type Job,
  type Redis,
} from "../../services/queue";

export type InfraSmokeResult = {
  ok: boolean;
  checks: {
    redis: QueueCheck;
    database: DatabaseCheck;
    pgvector: DatabaseCheck;
  };
  worker: {
    pid: number;
    node: string;
    platform: string;
  };
  jobId: string;
  startedAt: string;
  completedAt: string;
};

// A dedicated Redis connection for the diagnostic PING — kept separate
// from BullMQ's internal worker connection so the check measures the
// same code path callers would use, not BullMQ's pool.
let probeRedis: Redis | undefined;
function getProbeRedis(): Redis {
  if (!probeRedis) probeRedis = createRedisConnection();
  return probeRedis;
}

export async function disconnectProbeRedis(): Promise<void> {
  if (!probeRedis) return;
  const conn = probeRedis;
  probeRedis = undefined;
  await conn.quit();
}

export async function processInfraSmoke(job: Job): Promise<InfraSmokeResult> {
  const startedAt = new Date().toISOString();
  const prisma = getPrismaClient();
  const redis = getProbeRedis();

  const [redisCheck, databaseCheck] = await Promise.all([
    checkRedisReachable(redis),
    checkDatabaseReachable(prisma),
  ]);

  const pgvectorCheck: DatabaseCheck = databaseCheck.ok
    ? await checkPgvectorInstalled(prisma)
    : { ok: false, error: "skipped (database unreachable)" };

  const checks = {
    redis: redisCheck,
    database: databaseCheck,
    pgvector: pgvectorCheck,
  };
  const ok = Object.values(checks).every((c) => c.ok);

  return {
    ok,
    checks,
    worker: {
      pid: process.pid,
      node: process.version,
      platform: process.platform,
    },
    jobId: job.id ?? "(no id)",
    startedAt,
    completedAt: new Date().toISOString(),
  };
}
