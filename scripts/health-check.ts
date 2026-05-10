// Read-only external-behavior check for the web health endpoint.
//
// Used by `pnpm health:check`. Fetches GET /api/health from a running
// Next.js server (default http://localhost:3000) and verifies the
// response. Exits non-zero if the endpoint is unreachable, returns a
// non-success HTTP status, or reports any failing dependency check.

import { config as loadDotenv } from "dotenv";

loadDotenv();

type CheckResult = { ok: true } | { ok: false; error: string };

type HealthResponse = {
  status: "ok" | "fail";
  checks: Record<string, CheckResult>;
};

async function main(): Promise<number> {
  const base = process.env.HEALTH_URL ?? "http://localhost:3000";
  const url = `${base.replace(/\/$/, "")}/api/health`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    console.error(`health: unreachable at ${url} — ${err instanceof Error ? err.message : err}`);
    return 1;
  }

  let body: HealthResponse;
  try {
    body = (await response.json()) as HealthResponse;
  } catch (err) {
    console.error(`health: invalid JSON response (HTTP ${response.status}) — ${err instanceof Error ? err.message : err}`);
    return 1;
  }

  const lines = Object.entries(body.checks).map(([name, check]) => {
    return `${name.padEnd(9)} : ${check.ok ? "ok" : `FAIL — ${check.error}`}`;
  });
  console.log(lines.join("\n"));
  console.log(`status    : ${body.status} (HTTP ${response.status})`);

  return response.ok && body.status === "ok" ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
