// Read-only database reachability + pgvector availability check.
//
// Used by `pnpm db:check`. Connects to DATABASE_URL via the pg driver
// adapter, runs `SELECT 1`, then queries `pg_extension` for `vector`.
// Prints a compact status line and exits non-zero on any failure so
// operator/CI scripts can trust the exit code.

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { env } from "@/lib/env";

type CheckResult = { ok: true } | { ok: false; error: string };

async function checkDatabaseReachable(prisma: PrismaClient): Promise<CheckResult> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function checkPgvectorInstalled(prisma: PrismaClient): Promise<CheckResult> {
  try {
    const rows = await prisma.$queryRaw<Array<{ extname: string }>>`
      SELECT extname FROM pg_extension WHERE extname = 'vector'
    `;
    if (rows.length === 0) {
      return {
        ok: false,
        error: "pgvector extension is not installed (run pnpm db:migrate)",
      };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function main(): Promise<number> {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
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
    await prisma.$disconnect();
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
