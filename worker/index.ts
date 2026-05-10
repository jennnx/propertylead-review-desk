// Worker runtime entrypoint.
//
// Separate Node process from the Next.js web server. Wires Redis and
// BullMQ exclusively through @/services/queue, and registers processors
// for permanent infrastructure queues. Future product/domain queues
// register their processors here as well.

import { disconnectPrismaClient } from "../services/database";
import { QUEUE_NAMES, createWorker, type Worker } from "../services/queue";
import { disconnectProbeRedis, processInfraSmoke } from "./jobs/infra-smoke";

// BullMQ's `Worker` is contravariant in its `NameType` generic, so a
// `Worker<_, _, "infra.smoke">` is not assignable to `Worker<_, _, string>`.
// The shutdown loop only needs the common methods, so collect workers as
// the generic shape.
type AnyWorker = Worker<unknown, unknown, string>;

function registerWorkers(): AnyWorker[] {
  const infraSmoke = createWorker(QUEUE_NAMES.INFRA_SMOKE, processInfraSmoke);

  infraSmoke.on("ready", () => {
    console.log(`worker[${QUEUE_NAMES.INFRA_SMOKE}]: ready`);
  });
  infraSmoke.on("completed", (job) => {
    console.log(`worker[${QUEUE_NAMES.INFRA_SMOKE}]: job ${job.id} completed`);
  });
  infraSmoke.on("failed", (job, err) => {
    console.error(
      `worker[${QUEUE_NAMES.INFRA_SMOKE}]: job ${job?.id ?? "?"} failed:`,
      err,
    );
  });
  infraSmoke.on("error", (err) => {
    console.error(`worker[${QUEUE_NAMES.INFRA_SMOKE}]: error:`, err);
  });

  return [infraSmoke as AnyWorker];
}

async function shutdown(workers: AnyWorker[], signal: string): Promise<void> {
  console.log(`worker: ${signal} received, shutting down...`);
  const errors: unknown[] = [];
  for (const w of workers) {
    try {
      await w.close();
    } catch (err) {
      errors.push(err);
    }
  }
  try {
    await disconnectProbeRedis();
  } catch (err) {
    errors.push(err);
  }
  try {
    await disconnectPrismaClient();
  } catch (err) {
    errors.push(err);
  }
  if (errors.length > 0) {
    for (const err of errors) console.error("worker: shutdown error:", err);
    process.exit(1);
  }
  process.exit(0);
}

function main(): void {
  const workers = registerWorkers();
  console.log(`worker: started (pid=${process.pid}, queues=${workers.length})`);

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => {
      void shutdown(workers, signal);
    });
  }
}

main();
