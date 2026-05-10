# Triage OS

A [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, copy the sample environment file and adjust values for your local setup:

```bash
cp .env.example .env
```

Then run the development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Configuration

The app uses a single typed env object validated with [Zod](https://zod.dev), exported from `lib/env.ts`. Importing the module automatically loads variables from a local `.env` file via `dotenv`. Values already present in the process environment (Docker, CI, shell exports) win — `.env` only fills in missing values.

Required infrastructure variables at this stage:

| Variable       | Purpose                                                        |
| -------------- | -------------------------------------------------------------- |
| `DATABASE_URL` | PostgreSQL connection string (used by Prisma and the worker)   |
| `REDIS_URL`    | Redis connection string (used by BullMQ queues and the worker) |

Additional integration secrets (Claude, HubSpot, PromptFoo, etc.) will be added by their respective tracer slices and are intentionally not required yet.

Postgres and Redis can either be **user-managed** (your own local services or hosted instances) or provided by the **optional local dependency Compose stack** described below. Either way, `DATABASE_URL` and `REDIS_URL` in your `.env` must point at the chosen instances. See `.env.example` for documented placeholders.

## Local dependency stack (optional)

`docker-compose.deps.yml` provides Postgres (with pgvector) and Redis for developers who do not want to install or manage those services manually. It does **not** run the Next.js web app or the BullMQ worker — keep running those with `pnpm dev` so HMR/Turbopack stays available.

Image tags are pinned deliberately:

| Service  | Image                                  | Notes                                                                |
| -------- | -------------------------------------- | -------------------------------------------------------------------- |
| Postgres | `pgvector/pgvector:0.8.2-pg17-trixie`  | Postgres 17 with pgvector 0.8.2 baked into the image.                |
| Redis    | `redis:7.4-alpine3.21`                 | Redis 7.4 on Alpine 3.21.                                            |

Commands:

```bash
# Start Postgres + Redis in the background.
docker compose -f docker-compose.deps.yml up -d

# Tail logs.
docker compose -f docker-compose.deps.yml logs -f

# Stop the stack but keep the data volumes.
docker compose -f docker-compose.deps.yml down

# Stop the stack and discard the Postgres/Redis volumes (destructive).
docker compose -f docker-compose.deps.yml down -v
```

The default credentials match `.env.example` (`postgres:postgres@localhost:5432/triage_os` and `redis://localhost:6379`), so a fresh `cp .env.example .env` already points the app at the Compose stack. If you prefer your own Postgres/Redis instances, edit `.env` instead and skip the Compose commands.

### Usage

```ts
import { env } from "@/lib/env";

console.log(env.DATABASE_URL);
```

The schema validates lazily on first property access and throws a useful error listing every missing or malformed variable. Linting (`pnpm lint`) and typechecking do not trigger validation, so static checks succeed even without a populated `.env`.

## Database (Prisma + pgvector)

The project uses [Prisma](https://www.prisma.io) (v7) for schema and migrations against PostgreSQL with the [pgvector](https://github.com/pgvector/pgvector) extension. The schema (`prisma/schema.prisma`) intentionally defines no product/domain models yet — tracer feature slices add real models when they need them.

In Prisma 7 the connection URL no longer lives inside `schema.prisma`. The runtime client connects through the `@prisma/adapter-pg` driver adapter (reading `DATABASE_URL` from the env module), and migration commands read the URL from `prisma.config.ts`.

Scripts:

| Script               | What it does                                                                  |
| -------------------- | ----------------------------------------------------------------------------- |
| `pnpm db:generate`   | Regenerates the Prisma client. Runs automatically as `postinstall`.           |
| `pnpm db:migrate`    | Applies pending migrations (`prisma migrate deploy`). Use in production/CI.   |
| `pnpm db:migrate:dev`| Creates and applies new migrations from schema changes during development.    |
| `pnpm db:status`     | Shows pending vs. applied migrations (`prisma migrate status`).               |
| `pnpm db:check`      | Read-only check: connects to `DATABASE_URL` and verifies pgvector is enabled. |

### Ordering

- **Generate before build/typecheck** — `pnpm install` runs `prisma generate` via `postinstall` so generated types are available before `pnpm build`, `pnpm exec tsc --noEmit`, or `pnpm lint`. `pnpm build` also re-runs `prisma generate` defensively before `next build`. If you skipped install hooks, run `pnpm db:generate` manually.
- **Migrate before runtime start** — `pnpm db:migrate` (or `db:migrate:dev` locally) must run before `pnpm dev`/`pnpm start` and before the BullMQ worker starts. The production Compose stack will run a one-shot migration role for this; locally, run it once after starting the dependency stack and any time you pull new migrations.

### Initial pgvector setup

The baseline migration (`prisma/migrations/20260510000000_init/migration.sql`) issues `CREATE EXTENSION IF NOT EXISTS vector;`. Both the local dependency Compose stack and the production stack use the `pgvector/pgvector` image, so this only registers the extension in the configured database — no extension binaries are downloaded at migrate time.

Verify manually with:

```bash
pnpm db:check
```

The script prints one line per check (`database` and `pgvector`) and exits non-zero on any failure.

## Web health endpoint

`GET /api/health` is a read-only endpoint exposed by the Next.js app. It verifies the web process and its infrastructure dependencies without enqueuing jobs or mutating database state. Both local debugging and the production container healthcheck use it.

The response is JSON of the shape:

```json
{
  "status": "ok",
  "checks": {
    "server":   { "ok": true },
    "database": { "ok": true },
    "pgvector": { "ok": true },
    "redis":    { "ok": true },
    "queue":    { "ok": true }
  }
}
```

If any dependency check fails, the corresponding entry carries an `error` string, `status` becomes `"fail"`, and the endpoint returns HTTP **503** instead of **200**.

Call it locally:

```bash
# Start the dev server first (separate terminal).
pnpm dev

# Hit the endpoint directly.
curl -i http://localhost:3000/api/health

# Or run the bundled check script — same fetch, with a non-zero exit code
# on any failure (override the base URL with HEALTH_URL=... if needed).
pnpm health:check
```

## Service modules

Infrastructure code lives in deep service modules under `services/<name>/`. Each module exposes a narrow public API from its `index.ts`; the implementation lives in `services/<name>/internal/`. Callers — Next route handlers, the BullMQ worker, scripts, and future tests — should import from the module root and treat the internals as private:

```ts
// ✅ correct — import from the module root
import { getPrismaClient, checkPgvectorInstalled } from "@/services/database";
import { createQueue, QUEUE_NAMES } from "@/services/queue";

// ❌ wrong — reaches into internals, will fail lint
import { getPrismaClient } from "@/services/database/internal/client";
```

`pnpm lint` enforces this with `no-restricted-imports`: any non-service file that imports `@/services/*/internal/*` fails. Files inside `services/**` are exempt so a module can wire its own pieces together.

Generic utilities (`lib/env.ts`, `lib/utils.ts`) sit outside `services/` and may be imported anywhere via `@/lib/...`.

Modules currently published:

| Module              | Public surface                                                                                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@/services/database` | `getPrismaClient`, `disconnectPrismaClient`, `checkDatabaseReachable`, `checkPgvectorInstalled`, plus the `PrismaClient` and `CheckResult` types.             |
| `@/services/queue`    | `createRedisConnection`, `createQueue`, `createWorker`, `createQueueEvents`, `QUEUE_NAMES`, `checkRedisReachable`, `checkQueueInspectable`, plus BullMQ types. |

## BullMQ worker

The worker is a **separate Node process** from the Next.js web server. It owns no HTTP listener — it connects to Redis through `@/services/queue` and runs job processors for the queues declared in `QUEUE_NAMES`. Today only one queue is registered: `infra.smoke`, a permanent harmless diagnostic that verifies worker-side Redis, Postgres, and pgvector access. Future product/domain queues register their processors in `worker/index.ts` as well.

The worker entrypoint lives at `worker/index.ts`. Its compilation tsconfig is `worker/tsconfig.json`, which extends the root tsconfig but emits CommonJS into `dist/` (the rest of the project is consumed by Next.js's bundler and stays `noEmit`).

| Script              | What it does                                                                                                |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| `pnpm worker:dev`   | Runs `worker/index.ts` directly through `tsx` with watch mode — restarts on source changes.                 |
| `pnpm worker:build` | Compiles the worker (and the services/lib it imports) to plain JavaScript under `dist/` via `tsc`.          |
| `pnpm worker:start` | Starts the compiled worker from `dist/worker/index.js` with `node`. Used in the production Compose stack.   |

### Local development

In separate terminals, alongside the dependency stack from `docker-compose.deps.yml`:

```bash
# 1. Dependencies (Postgres + Redis).
docker compose -f docker-compose.deps.yml up -d

# 2. Apply migrations once after the dependency stack is healthy.
pnpm db:migrate

# 3. Web app (Next.js dev server).
pnpm dev

# 4. Worker (this process).
pnpm worker:dev
```

The worker logs `worker: started (pid=…, queues=N)` on boot and `worker[infra.smoke]: ready` once the BullMQ worker has connected to Redis. `SIGINT` / `SIGTERM` trigger a graceful shutdown that closes each BullMQ worker, the probe Redis connection, and the Prisma client.

### Production

The production Compose stack (added in a later tracer slice) builds a single application image and runs `pnpm worker:start` as the worker role. That command requires `dist/worker/index.js` to exist, so the image build runs `pnpm worker:build` after `pnpm install`.

### The `infra.smoke` diagnostic job

`worker/jobs/infra-smoke.ts` is the queue's processor. For each job, it:

- Issues `PING` against a dedicated Redis connection (separate from BullMQ's internal pool, so the check measures the same code path callers use).
- Runs `SELECT 1` through Prisma to verify Postgres reachability.
- Runs `SELECT extname FROM pg_extension WHERE extname = 'vector'` to verify the pgvector extension is installed.
- Returns a structured result of the form:

```json
{
  "ok": true,
  "checks": {
    "redis":    { "ok": true },
    "database": { "ok": true },
    "pgvector": { "ok": true }
  },
  "worker": { "pid": 1234, "node": "v20.x.x", "platform": "linux" },
  "jobId": "1",
  "startedAt": "2026-05-10T00:00:00.000Z",
  "completedAt": "2026-05-10T00:00:00.010Z"
}
```

The job is intentionally read-only and **does not** call CRM, Claude, PromptFoo, or any future business integration, and does not write to product/domain tables. Its purpose is to prove the worker-side infrastructure path end-to-end without exercising real lead-analysis behaviour.

To verify the job runs, enqueue one from any process that holds a `@/services/queue` handle (e.g. a one-off script or the upcoming verification command in #9):

```ts
import { QUEUE_NAMES, createQueue } from "@/services/queue";
const q = createQueue(QUEUE_NAMES.INFRA_SMOKE);
await q.add("ping", {});
```

The worker terminal should print `worker[infra.smoke]: job <id> completed`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
