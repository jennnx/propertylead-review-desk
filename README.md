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

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
