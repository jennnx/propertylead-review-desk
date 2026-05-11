# Project Context

## Product Intent

PropertyLead Review Desk helps real estate agents handle incoming leads by enriching CRM records and writing the enrichment back to the CRM. The app is not the source of lead capture and is not intended to replace the CRM.

The basic workflow is:

1. A CRM sends an incoming lead to this app through a webhook or similar integration.
2. The app normalizes and enriches the lead using Claude's API and supporting project data.
3. The app decides the CRM writeback payload: tags, insights, prioritization, and any other review metadata needed by the real estate agent.
4. The app writes those enhancements back to the CRM so the agent can continue working from the CRM.

The core operator workflow is CRM-in, CRM-out. Inputs originate from the CRM, and the CRM remains the place where the real estate agent sees and acts on the enriched lead. That does not make this app stateless. PropertyLead Review Desk still owns platform state and workflows needed to make CRM writeback trustworthy: human review, human-in-the-loop messaging confirmations, enrichment traces, queued work, eval results, diagnostics, and observability around what the app decided and why.

Durable product value is delivered by improving the CRM record, but this platform must stay inspectable. Internal UI, queues, evals, tests, RAG, diagnostics, and review screens exist so operators and maintainers can understand, verify, and improve the enrichment/writeback process without turning this app into the CRM itself.

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
