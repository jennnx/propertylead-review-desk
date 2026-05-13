import { getPrismaClient } from "./client";

export type CheckResult = { ok: true } | { ok: false; error: string };

export async function checkDatabaseReachable(): Promise<CheckResult> {
  try {
    await getPrismaClient().$queryRaw`SELECT 1`;
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function checkPgvectorInstalled(): Promise<CheckResult> {
  try {
    const rows = await getPrismaClient().$queryRaw<Array<{ extname: string }>>`
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
