# 0007 — pgvector is enabled per-database via a Prisma migration, not by the image

**Status**: Accepted

## Context

We use the `pgvector/pgvector:0.8.2-pg17-trixie` Postgres image. A natural assumption — and one that comes up regularly when people look at this stack — is that picking the `pgvector` image is enough to make `vector` columns work. It isn't, and the gap is easy to miss because the failure mode (e.g., `ERROR: type "vector" does not exist`) only shows up the first time someone tries to use a vector column, which is often deep into product work.

Postgres extensions operate at two levels:

1. **Image level** — the extension's shared library file (`.so`) is available to the Postgres binary. Provided by the image.
2. **Database level** — the extension is registered in a specific database's catalog (`pg_extension`) and its types/operators become callable. Provided by `CREATE EXTENSION vector;` run **inside that database**.

The image gives you (1). The database doesn't even exist when the image is built — it's created from `POSTGRES_DB` on first container init. So (2) has to happen later.

`docker-entrypoint-initdb.d/*.sql` is one way to handle (2), but it only runs on first volume init. If the volume already exists (a stack restart, a migrated environment) the init scripts are skipped. Tying extension enablement to volume newness is fragile.

## Decision

`CREATE EXTENSION IF NOT EXISTS vector;` ships as a regular Prisma migration (`prisma/migrations/20260510000000_init/migration.sql`). The migration is idempotent and runs every time `prisma migrate deploy` runs — which, in our setup, is the `migrate` one-shot role in the production compose stack (see [ADR 0003](0003-single-shared-application-image.md)).

## Consequences

- The extension is enabled by the same mechanism that applies every other schema change: a Prisma migration. There is one canonical place to look ("does my migration sequence include the extension?"), not two.
- Switching to a managed Postgres provider (Neon, RDS with pgvector, Railway's pgvector template) works without code changes. The image disappears; the migration still runs.
- Idempotence (`IF NOT EXISTS`) means re-running migrations on an existing database is safe — the extension stays as-is.
- The image choice still matters: it provides the `.so` file. If we ever switched to a managed Postgres that does *not* offer pgvector, this migration would fail with a clear error, and we'd be forced to either bring our own Postgres or pick a different vector store. That failure mode is intentional and loud — better than silently using a vector-less database.
