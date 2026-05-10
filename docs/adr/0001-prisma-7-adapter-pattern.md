# 0001 — Prisma 7 with `prisma.config.ts` and `@prisma/adapter-pg`

**Status**: Accepted

## Context

Prisma 7 dropped `url` from the `datasource` block in `schema.prisma`. The Prisma 6 pattern of declaring the connection string in the schema and letting the runtime `PrismaClient` pick it up *just by importing* no longer works:

- Migration commands need the URL from a separate config file (`prisma.config.ts`).
- The runtime `PrismaClient` needs an explicit driver adapter passed in at construction; `new PrismaClient()` with no arguments cannot connect.

This is a breaking change relative to most Prisma examples and tutorials online (still Prisma 6-style), so a reader trying to wire up a new query is likely to copy-paste the old pattern and have it fail at runtime with a confusing error.

## Decision

- **Migration commands** read `DATABASE_URL` from `prisma.config.ts`, which imports our env module so there is exactly one source of truth for the connection string.
- **Runtime queries** go through `@prisma/adapter-pg`. `services/database/internal/client.ts` constructs a `PrismaPg` driver instance from `DATABASE_URL` and passes it as `new PrismaClient({ adapter })`.
- `prisma generate --no-hints` runs via `postinstall` and the `build` chain so generated types are always available before TypeScript or Next.js sees app code.

## Consequences

- Anyone adding a new query in app code does not import Prisma directly — they call `getPrismaClient()` from `@/services/database`, which already has the adapter wired up.
- The `pnpm db:generate` script accepts a placeholder `DATABASE_URL` so generation works on a fresh checkout before `.env` is populated.
- Switching providers (Neon, RDS, Railway pgvector template) is a one-line change in the adapter construction — no schema or runtime code edits.
- If a future Prisma version restores schema-embedded URLs, this layout still works; we'd just remove `prisma.config.ts` and the explicit adapter argument.
