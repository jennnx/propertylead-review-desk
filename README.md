# Triage OS

Next.js web app + BullMQ worker. Postgres (pgvector) + Redis. Docker Compose for prod, behind nginx.

## Local dev

```bash
cp .env.example .env
docker compose -f docker-compose.deps.yml up -d postgres redis
pnpm install
pnpm db:migrate
pnpm dev          # web on :3000
pnpm worker:dev   # separate terminal
```

Using a host Postgres or Redis? Edit `DATABASE_URL` / `REDIS_URL` and drop the matching service from `up -d` (e.g. `up -d postgres` only).

## Deploy (VPS)

```bash
git clone <repo> && cd propertylead-review-desk
cp .env.example .env
# Set APP_BASE_URL to the public app URL and POSTGRES_PASSWORD to a strong random value
docker compose up -d --build
```

nginx is the only service publicly bound. Open :80 (and :443 if you add TLS), point DNS at the VPS. TLS + binding rationale: [ADR 0005](docs/adr/0005-prod-network-binding.md).

To connect the HubSpot Integration to this deployment, follow [the HubSpot setup guide](docs/hubspot-setup.md).

## Gotchas

- `POSTGRES_PASSWORD` is baked into the postgres volume on first `up`. Changing it later: `docker compose down -v` (destroys data). [ADR 0005](docs/adr/0005-prod-network-binding.md).
- Worker is a separate process. `pnpm dev` does not start it. [ADR 0002](docs/adr/0002-worker-as-separate-process.md).
- Import services from the package root, not `internal/`. `pnpm lint` enforces this. [ADR 0004](docs/adr/0004-service-modules-with-internal.md).
- `prisma generate` runs as `postinstall`. If install hooks are skipped, run `pnpm db:generate` before build/typecheck. [ADR 0001](docs/adr/0001-prisma-7-adapter-pattern.md).
- `waitUntilFinished` lives in `scripts/queue-verify.ts` only — never in request paths. [ADR 0006](docs/adr/0006-permanent-diagnostic-queue.md).

## FAQ

**`ECONNREFUSED 127.0.0.1:5432` (or `:6379`)** — deps stack isn't up.
```bash
docker compose -f docker-compose.deps.yml up -d postgres redis
```

**Web works, jobs never run** — worker isn't started.
```bash
pnpm worker:dev
```

**Prisma `relation "..." does not exist` or `type "vector" does not exist`** — migrations not applied.
```bash
pnpm db:migrate
```

**Prisma types missing / `@prisma/client` not found** — client not generated.
```bash
pnpm db:generate   # or rerun `pnpm install`
```

**Port 5432 / 6379 / 3000 already in use** — host already runs that service. Either stop it (`brew services stop postgresql@14`) or keep it: point `.env` at it and skip the matching compose service.

## Scripts

| Script | What |
| --- | --- |
| `pnpm dev` | Next.js dev server (HMR / Turbopack) |
| `pnpm worker:dev` | Worker in watch mode (tsx) |
| `pnpm build` | `prisma generate` + `next build` |
| `pnpm worker:build` | Compile worker to `dist/` |
| `pnpm start` | Next.js production server |
| `pnpm test` | Vitest test suite |
| `pnpm worker:start` | Compiled worker from `dist/` |
| `pnpm db:migrate` | `prisma migrate deploy` |
| `pnpm db:migrate:dev` | New migration from schema changes (local only) |
| `pnpm db:generate` | Regenerate Prisma client (also runs as `postinstall`) |
| `pnpm db:status` | Pending vs. applied migrations |
| `pnpm db:check` | Connectivity + pgvector probe |
| `pnpm health:check` | `GET /api/health` probe (`HEALTH_URL` overrides base) |
| `pnpm queue:verify` | End-to-end queue + worker probe |
| `pnpm lint` | ESLint |
| `pnpm exec tsc --noEmit` | Typecheck |

## Reference

- [`docs/adr/`](docs/adr/) — ADRs.
- [`CLAUDE.md`](CLAUDE.md), [`AGENTS.md`](AGENTS.md) — agent instructions.
- [`docs/agents/`](docs/agents/) — agent skill mappings.
