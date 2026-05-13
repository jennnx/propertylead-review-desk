# 0009 — Service data access layers are colocated with owning services

**Status**: Accepted

## Context

ADR 0008 establishes `services/<name>/` as the capability boundary for product
behavior. A service owns business policy, provider calls, persistence
orchestration, queues, and failure handling behind a public API.

As soon as a service writes real product data, another boundary appears inside
that service: business logic should not be coupled to the database library. A
business operation should be able to say "record these HubSpot Webhook Events",
"create a ticket", or "write an audit log entry" without caring whether the
write uses Prisma, Kysely, SQL, or another persistence tool underneath.

Two layouts were considered:

1. Put service-specific database access under the owning service, for example
   `services/hubspot-webhooks/internal/mutations.ts`.
2. Put all database access under the database service, for example
   `services/database/internal/hubspot/mutations.ts`, and expose it as
   `database.hubspot.recordWebhookEvents(...)`.

The second option groups files by storage mechanism. That makes
`services/database` aware of every product domain and creates a parallel domain
tree organized around the database, which conflicts with the vertical service
shape from ADR 0008.

## Decision

Direct database access for a product capability is colocated with the owning
service.

Reserved filenames:

```text
services/<name>/
  index.ts
  internal/
    queries.ts       # direct database reads for this service
    mutations.ts     # direct database writes for this service
    ...
```

Rules:

- `queries.ts` contains direct database reads only.
- `mutations.ts` contains direct database writes only.
- These files may import `getPrismaClient()` from `services/database`.
- Business-logic files call query and mutation functions; they do not import
  Prisma, Kysely, SQL clients, or generated database model types directly.
- Query and mutation functions accept plain service-shaped inputs and return
  plain results. They should not accept route/framework objects.
- Query and mutation functions do not decide product policy. They perform the
  read or write requested by the caller.
- Query functions that return data from `$queryRaw` must parse the result
  through a Zod schema before returning it. `$queryRaw<T>` is only a
  TypeScript assertion; the schema is the runtime contract. Generated
  Prisma model methods (`findMany`, `findUnique`, etc.) already enforce
  their own runtime shape and do not need an extra Zod pass.
- Orchestration belongs in business-logic files. For example, "create a ticket,
  then write an audit log entry" is the caller's responsibility; each mutation
  only knows how to perform its own write.
- `services/database` remains infrastructure: client construction, connection
  checks, transaction primitives if needed, and database-wide utilities. It
  should not grow product-specific namespaces such as `database.hubspot`.

This means a HubSpot service write should look like:

```ts
// services/hubspot-webhooks/internal/webhook-receipt.ts
await recordHubSpotWebhookEvents(events, receivedAt)
```

And the direct Prisma call should live behind:

```ts
// services/hubspot-webhooks/internal/mutations.ts
getPrismaClient().hubSpotWebhookEvent.createMany(...)
```

## Failure mode (do not do this)

The recurring failure mode is: an orchestration file (`operations.ts`,
`ingestion.ts`, `processing.ts`, a `handle-*` file) imports
`getPrismaClient` from `services/database` or imports `Prisma` from
`@prisma/client` and writes the database call inline. Often the author
tells themselves "it's a single call, a mutation file is overkill."
The cost compounds anyway:

- Tests have to mock the entire Prisma client shape — `sopDocument:
  { create, findMany, findUnique, update, delete }`, `sopChunk:
  { deleteMany }`, `$transaction`, `$executeRaw`, `$queryRaw` — even
  when each individual test only cares about one of those calls.
  Mocks balloon and start asserting on Prisma argument shapes
  (`expect(prisma.sopDocument.update).toHaveBeenCalledWith({ where: …,
  data: … })`) instead of asserting on observable behavior.
- Prisma-specific concerns leak upward: `Prisma.DbNull`,
  `Prisma.JsonValue`, `PrismaClientKnownRequestError` codes
  (`"P2025"`), raw SQL strings, pgvector literal construction. The
  orchestrator now knows table names, column names, and ORM error
  semantics. Swapping the ORM is no longer a localized change.
- Multi-step writes get encoded inline as `prisma.$transaction(async
  (tx) => …)` blocks with three or four operations inside. The
  transactional contract — "these writes succeed or fail together" —
  lives in an anonymous arrow function in an orchestration file
  instead of being a named mutation a future reader can search for.

### Concrete anti-pattern

```ts
// services/sop/internal/operations.ts — BAD
import { Prisma } from "@prisma/client";
import { getPrismaClient } from "@/services/database";

export async function deleteSopDocument(id: string): Promise<void> {
  try {
    const { storagePath } = await getPrismaClient().sopDocument.delete({
      where: { id },
      select: { storagePath: true },
    });
    await unlink(storagePath);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return; // not-found is a no-op
    }
    throw error;
  }
}
```

The orchestrator is now coupled to Prisma the library: it knows the
error class, the error code string, the `.delete` method, and the
`select` projection grammar. A test for "delete is a no-op for
non-existent ids" has to construct a `PrismaClientKnownRequestError`
to make this branch run.

### Resolution

Move the database call into `mutations.ts` and surface a return value
that expresses what the orchestrator actually needs to know:

```ts
// services/sop/internal/mutations.ts — GOOD
import { Prisma } from "@prisma/client";
import { getPrismaClient } from "@/services/database";

export async function deleteSopDocumentRow(
  id: string,
): Promise<{ storagePath: string } | null> {
  try {
    return await getPrismaClient().sopDocument.delete({
      where: { id },
      select: { storagePath: true },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return null;
    }
    throw error;
  }
}
```

```ts
// services/sop/internal/operations.ts — GOOD
import { deleteSopDocumentRow } from "./mutations";

export async function deleteSopDocument(id: string): Promise<void> {
  const deleted = await deleteSopDocumentRow(id);
  if (deleted) {
    await unlink(deleted.storagePath);
  }
}
```

Now the orchestrator reads top-to-bottom in domain language. The test
mocks `deleteSopDocumentRow` (one function, two return shapes:
`{ storagePath }` or `null`) instead of a Prisma client. The Prisma
error class lives in exactly one place — the mutation file that owns
the write.

The same shape applies to multi-step writes: if `ingestSopDocument`
needs to atomically clear chunks, insert new chunks with embeddings,
and mark a document `READY`, that whole `$transaction` is a single
mutation function (`replaceSopChunks(documentId, chunksWithEmbeddings)`
or similar), not an inline transaction block in the orchestrator.

### Enforcement

This rule is mechanically enforced by an ESLint `no-restricted-imports`
rule scoped to `services/**`:

- `@prisma/client` and `getPrismaClient` from `@/services/database` are
  forbidden imports.
- The allowlist is exactly `services/**/internal/queries.ts`,
  `services/**/internal/mutations.ts`, and `services/database/**`.

If lint fires, the fix is to move the database call into the colocated
`queries.ts` / `mutations.ts` and import the resulting function into
the orchestrator. Adding a file-level eslint-disable to suppress the
rule is not an acceptable resolution — it defeats the discipline the
rule exists to maintain.

## Consequences

- Business logic is insulated from the chosen database library.
- Persistence code stays near the service behavior it supports.
- `services/database` stays a small infrastructure service instead of becoming
  a product-domain registry.
- Swapping Prisma for another database library later is localized to the
  service data access layer.
- Tests should continue to prefer public service behavior. Query and mutation
  files only need direct tests when their database behavior becomes nontrivial.

The cost is a little repetition: multiple services may each have their own
`queries.ts` and `mutations.ts`. That is intentional. The service boundary is
more important than centralizing all SQL-shaped code.
