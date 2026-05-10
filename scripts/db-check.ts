// Read-only database reachability + pgvector availability check.
//
// Used by `pnpm db:check`. Connects to DATABASE_URL through the
// `@/services/database` public interface, runs the documented checks, and
// exits non-zero on any failure so operator/CI scripts can trust the
// exit code.

import {
  checkDatabaseReachable,
  checkPgvectorInstalled,
  disconnectPrismaClient,
  getPrismaClient,
} from "@/services/database";

async function main(): Promise<number> {
  const prisma = getPrismaClient();
  try {
    const reachable = await checkDatabaseReachable(prisma);
    const pgvector = reachable.ok
      ? await checkPgvectorInstalled(prisma)
      : { ok: false as const, error: "skipped (database unreachable)" };

    const lines = [
      `database  : ${reachable.ok ? "ok" : `FAIL — ${reachable.error}`}`,
      `pgvector  : ${pgvector.ok ? "ok" : `FAIL — ${pgvector.error}`}`,
    ];
    console.log(lines.join("\n"));

    return reachable.ok && pgvector.ok ? 0 : 1;
  } finally {
    await disconnectPrismaClient();
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
