# Triage OS

Infrastructure foundation for an AI lead-analysis service. Next.js web app + BullMQ worker, backed by Postgres (pgvector) and Redis, with a production-style Docker Compose stack fronted by nginx.

## Quick start (local dev)

```bash
cp .env.example .env
docker compose -f docker-compose.deps.yml up -d postgres redis
pnpm install
pnpm db:migrate
pnpm dev          # Next.js with HMR on http://localhost:3000
pnpm worker:dev   # BullMQ worker — separate terminal
```

If you already run Postgres or Redis on your host, point `DATABASE_URL` / `REDIS_URL` in `.env` at them and omit the matching service from the `docker compose -f docker-compose.deps.yml up -d` line (e.g. `up -d postgres` only).

## Deploy (VPS)

```bash
git clone <repo> && cd propertylead-review-desk
cp .env.example .env
# Edit .env: set POSTGRES_PASSWORD to a strong random value
docker compose up -d --build
```

Then open firewall port 80 (and 443 if you add TLS) and point DNS at the VPS. The compose stack runs Postgres, Redis, a one-shot migration role, web, worker, and nginx; nginx is the only service publicly bound.

For TLS, network binding rationale, and the broader production story, see [ADR 0005](docs/adr/0005-prod-network-binding.md).

## Gotchas

- **`POSTGRES_PASSWORD` is locked in at first `docker compose up`.** Postgres initialises the data volume with whatever value is set at first boot; changing it later requires `docker compose down -v`, which destroys the volume. Set it before the first up. See [ADR 0005](docs/adr/0005-prod-network-binding.md).
- **The worker is a separate process** — `pnpm dev` does *not* start it. Run `pnpm worker:dev` in a second terminal. See [ADR 0002](docs/adr/0002-worker-as-separate-process.md).
- **Import services from the public root, not `internal/`.** `pnpm lint` will fail otherwise. See [ADR 0004](docs/adr/0004-service-modules-with-internal.md).
- **`prisma generate` runs via `postinstall`.** If you ever skip install hooks, run `pnpm db:generate` before build/typecheck. See [ADR 0001](docs/adr/0001-prisma-7-adapter-pattern.md).
- **`waitUntilFinished` is restricted to `scripts/queue-verify.ts`.** Do not call it from a route handler or anywhere else in the request path. See [ADR 0006](docs/adr/0006-permanent-diagnostic-queue.md).

## Scripts

| Script              | What                                                                  |
| ------------------- | --------------------------------------------------------------------- |
| `pnpm dev`          | Next.js dev server (HMR / Turbopack)                                  |
| `pnpm worker:dev`   | BullMQ worker in watch mode (tsx)                                     |
| `pnpm build`        | Production build (`prisma generate` + `next build`)                   |
| `pnpm worker:build` | Compile worker to `dist/` via `tsc`                                   |
| `pnpm start`        | Run the Next.js production server                                     |
| `pnpm worker:start` | Run the compiled worker from `dist/`                                  |
| `pnpm db:migrate`   | `prisma migrate deploy` — apply pending migrations                    |
| `pnpm db:migrate:dev` | Create + apply a new migration from schema changes (local only)     |
| `pnpm db:generate`  | Regenerate Prisma client (also runs as `postinstall`)                 |
| `pnpm db:status`    | Show pending vs. applied migrations                                   |
| `pnpm db:check`     | Read-only probe: connectivity + pgvector                              |
| `pnpm health:check` | Probe `GET /api/health` (override base via `HEALTH_URL`)              |
| `pnpm queue:verify` | End-to-end queue + worker probe via `infra.smoke` job                 |
| `pnpm lint`         | ESLint                                                                |
| `pnpm exec tsc --noEmit` | Type check                                                       |

## Reference

- [`docs/adr/`](docs/adr/) — Architecture Decision Records. Read when you find a non-obvious choice and want to know why.
- [`CLAUDE.md`](CLAUDE.md), [`AGENTS.md`](AGENTS.md) — agent-facing instructions for working in this repo.
- [`docs/agents/`](docs/agents/) — agent skill mappings (issue tracker, triage labels, domain docs).
