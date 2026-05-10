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

Postgres and Redis can either be **user-managed** (your own local services or hosted instances) or, in a later tracer slice, provided by an **optional local dependency Compose stack**. See `.env.example` for documented placeholders.

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
