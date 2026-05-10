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

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
