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
