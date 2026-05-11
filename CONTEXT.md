# Project Context

## How We Code

This repo uses vertical services, also called deep slices, as the default architecture for product and infrastructure work. A service owns a capability end to end: the public operation, policy, persistence orchestration, provider calls, queues, and failure handling that belong to that capability.

Services live under `services/<name>/`:

```text
services/<name>/
  index.ts
  internal/
    ...
```

The `index.ts` file is the public API. Everything under `internal/` is private implementation. Callers import from `@/services/<name>`, never from `@/services/<name>/internal`.

Route files, Server Actions, Route Handlers, scripts, and workers should be thin adapters around service APIs. They parse framework inputs, authorize, call services, revalidate or respond, and then stop. Business policy belongs in services, not in `page.tsx`, UI components, route handlers, scripts, or worker entrypoints.

`lib/` is only for small generic utilities reused everywhere by design, such as `env` and `utils`. It is not where product capabilities should accumulate.

For the full rationale, examples, and Next.js route guidance, see [ADR 0008](docs/adr/0008-vertical-services-and-deep-slices.md).

## Naming

Infrastructure and deployment docs currently use `Triage OS`. App metadata uses `PropertyLead Review Desk`. Until the product naming is reconciled, use existing terms deliberately and avoid inventing new names in architecture docs.
