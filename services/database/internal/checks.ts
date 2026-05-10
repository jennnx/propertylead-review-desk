import type { PrismaClient } from "@prisma/client";

export type CheckResult = { ok: true } | { ok: false; error: string };

export async function checkDatabaseReachable(prisma: PrismaClient): Promise<CheckResult> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function checkPgvectorInstalled(prisma: PrismaClient): Promise<CheckResult> {
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
