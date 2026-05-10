import { Redis, type RedisOptions } from "ioredis";

import { env } from "@/lib/env";

// `maxRetriesPerRequest: null` is required by BullMQ Workers and QueueEvents
// (they hold blocking commands). Applying it to every connection keeps the
// factory uniform — Queue producers tolerate the option just fine.
const baseRedisOptions: RedisOptions = {
  maxRetriesPerRequest: null,
};

export function createRedisConnection(extra?: RedisOptions): Redis {
  return new Redis(env.REDIS_URL, { ...baseRedisOptions, ...extra });
}
