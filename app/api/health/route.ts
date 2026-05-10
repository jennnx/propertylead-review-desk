import {
  QUEUE_NAMES,
  type Queue,
  type Redis,
  checkQueueInspectable,
  checkRedisReachable,
  createQueue,
  createRedisConnection,
} from "@/services/queue";
import {
  checkDatabaseReachable,
  checkPgvectorInstalled,
  getPrismaClient,
} from "@/services/database";

type CheckOk = { ok: true };
type CheckFail = { ok: false; error: string };
type Check = CheckOk | CheckFail;

type HealthResponse = {
  status: "ok" | "fail";
  checks: {
    server: Check;
    database: Check;
    pgvector: Check;
    redis: Check;
    queue: Check;
  };
};

// Cache the Redis connection and Queue handle so frequent healthchecks
// don't churn TCP connections. The Prisma client is already cached by
// `@/services/database`.
let cachedRedis: Redis | undefined;
let cachedQueue: Queue | undefined;

function getHealthRedis(): Redis {
  if (!cachedRedis) cachedRedis = createRedisConnection();
  return cachedRedis;
}

function getHealthQueue(): Queue {
  if (!cachedQueue) cachedQueue = createQueue(QUEUE_NAMES.INFRA_SMOKE);
  return cachedQueue;
}

export async function GET(): Promise<Response> {
  const prisma = getPrismaClient();
  const redis = getHealthRedis();
  const queue = getHealthQueue();

  const [database, redisReachable] = await Promise.all([
    checkDatabaseReachable(prisma),
    checkRedisReachable(redis),
  ]);

  const [pgvector, queueInspectable] = await Promise.all([
    database.ok
      ? checkPgvectorInstalled(prisma)
      : Promise.resolve<CheckFail>({ ok: false, error: "skipped (database unreachable)" }),
    redisReachable.ok
      ? checkQueueInspectable(queue)
      : Promise.resolve<CheckFail>({ ok: false, error: "skipped (redis unreachable)" }),
  ]);

  const checks: HealthResponse["checks"] = {
    server: { ok: true },
    database,
    pgvector,
    redis: redisReachable,
    queue: queueInspectable,
  };
  const allOk = Object.values(checks).every((check) => check.ok);
  const body: HealthResponse = {
    status: allOk ? "ok" : "fail",
    checks,
  };

  return Response.json(body, { status: allOk ? 200 : 503 });
}
