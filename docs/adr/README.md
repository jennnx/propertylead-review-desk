# Architecture Decision Records

Each file in this folder documents one non-obvious decision and the reasoning behind it. The goal is to answer the question "why did they do it *this* way, instead of the obvious way?" — not to describe what the code already shows.

Add a new ADR when a decision (a) is unlikely to change soon and (b) wouldn't be obvious to someone reading the code cold. Skip ADRs for decisions that the code itself makes self-evident.

## Index

| #    | Decision                                                                                                | Status   |
| ---- | ------------------------------------------------------------------------------------------------------- | -------- |
| 0001 | [Prisma 7 with `prisma.config.ts` and `@prisma/adapter-pg`](0001-prisma-7-adapter-pattern.md)           | Accepted |
| 0002 | [Worker runs as a separate Node process from the web server](0002-worker-as-separate-process.md)        | Accepted |
| 0003 | [One shared application image runs web, worker, and migrate](0003-single-shared-application-image.md)   | Accepted |
| 0004 | [Service modules expose a public root with implementation in `internal/`](0004-service-modules-with-internal.md) | Accepted |
| 0005 | [Production stack binds non-public services to `127.0.0.1`, fronted by nginx](0005-prod-network-binding.md) | Accepted |
| 0006 | [`infra.smoke` is a permanent diagnostic queue, and `waitUntilFinished` is restricted to verification](0006-permanent-diagnostic-queue.md) | Accepted |
| 0007 | [pgvector is enabled per-database via a Prisma migration, not by the image](0007-pgvector-via-migration.md) | Accepted |
| 0008 | [Product code is organized as vertical services and deep slices](0008-vertical-services-and-deep-slices.md) | Accepted |
