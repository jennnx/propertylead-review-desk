# 0008 — Product code is organized as vertical services and deep slices

**Status**: Accepted

## Context

ADR 0004 already established a deep-module shape for infrastructure services: each service has a public root at `services/<name>/index.ts`, with implementation hidden under `services/<name>/internal/`. The current scaffold uses that pattern for `services/database` and `services/queue`, and lint already blocks callers outside `services/**` from importing service internals.

That pattern should also guide product code as the app grows. We expect future work around PropertyLead lead triage, CRM integration, AI review / Claude calls, RAG and embeddings, eval pipelines, BullMQ jobs, and review desk screens. Without a vertical service rule, that behavior would spread across `app/`, `lib/`, scripts, route handlers, queue processors, and direct database calls.

The risk is not just messy folders. If routes, workers, and scripts own business orchestration directly, every behavior change requires understanding too many files at once. Callers couple to helper-level details. Tests, when added, drift toward implementation mechanics instead of product contracts. That is hard for humans and especially hard for coding agents.

## Decision

Use `services/` as the capability boundary for both infrastructure and product behavior.

Every substantial capability should live behind a service public API:

```text
services/<name>/
  index.ts
  internal/
    ...
```

Rules:

- A service exposes its public interface from `services/<name>/index.ts`.
- Implementation details live in `services/<name>/internal/`.
- Callers outside `services/**` must not import service internals.
- Services should expose business operations, not bags of low-level helpers.
- App Router pages, Server Actions, Route Handlers, workers, and scripts compose services; they should not own business policy.
- Dependency injection is allowed, but dependencies should usually be narrow service interfaces or ports, not giant flat helper bags.
- Build in thin end-to-end slices: one real user-visible path at a time.

This is the concrete repo convention. The concept may be called vertical modules or deep modules elsewhere, but this codebase uses `services/<name>/`.

## Service Shape

Existing services:

```text
services/database/
services/queue/
```

Future product/domain services should use the same shape when those slices are implemented:

```text
services/lead-review/
services/crm-sync/
services/ai-review/
services/evals/
services/rag/
services/audit-log/
```

The exact service names should be chosen when real slices land, but they should live under `services/`, not a parallel `modules/` tree.

Service APIs should read like product capabilities. For example:

```ts
const leadReview = createLeadReviewService(deps)

await leadReview.approveLead(...)
await leadReview.rejectLead(...)
await leadReview.requestMoreInfo(...)
```

The caller should not need to know whether approval writes Postgres rows, enqueues a BullMQ job, syncs to a CRM, records audit history, or calls an AI provider. Those are implementation details behind the service API.

## Fullstack Shape

Next.js App Router routes can have many queries and mutations. That does not make the route the service. The route segment should stay a composition shell around page-local orchestration and deep services.

For a future review desk route:

```text
app/leads/[leadId]/
  page.tsx
  actions.ts
  leadReviewPage.server.ts
  LeadReviewView.tsx
  components/
    ...
```

Responsibilities:

- `page.tsx` unwraps `params`, calls the page-data function, and renders the view.
- `leadReviewPage.server.ts` composes service calls into one route view model.
- `actions.ts` contains `"use server"` actions that parse `FormData`, authorize, call services, and revalidate/update/redirect.
- `LeadReviewView.tsx` and route-local components render data and submit actions.
- `services/*` owns business behavior, persistence orchestration, provider calls, queues, and policy.

This route-level shape is allowed to coordinate several services. That coordination is page composition, not product policy. If a rule decides whether a lead can be approved, rejected, enriched, synced, or queued, that rule belongs in a service.

## Next.js Notes

This repo uses the App Router. Before changing Next.js behavior, read the relevant local docs under `node_modules/next/dist/docs/` as required by `AGENTS.md`.

Current local docs describe Server Functions / Server Actions as server-side async functions that can be invoked through direct POST requests. Treat every Server Action as a real server entrypoint:

- Authorize inside every action. UI visibility is not an authorization boundary.
- Treat Route Handlers as public HTTP endpoints with the same security posture.
- Let actions and route handlers adapt framework inputs to service calls; do not put business policy there.
- After mutations, revalidate deliberately. Prefer precise tag-based revalidation once stable cache tags exist; use path revalidation for route-level invalidation when tags do not exist yet.
- Do not run long background work inline in a request path. Enqueue work and let `worker/` consume it, consistent with ADR 0002 and ADR 0006.

## Vertical Slice Workflow

Add behavior in thin end-to-end slices rather than broad horizontal layers.

Good first slices for this product might be:

- Show one lead review page with a real service-backed view model.
- Approve a lead through one Server Action.
- Reject a lead with a reason.
- Enqueue CRM sync after approval.
- Show CRM sync status in the review timeline.

Each slice should name the service operation first, add the smallest route/UI/worker surface needed to exercise it, and keep implementation details behind the service public API.

Tests should target public service behavior and externally visible outcomes.

## What This Is Not

- Not a new `modules/` directory.
- Not a `src/` migration.
- Not a feature folder where callers import every helper.
- Not putting business rules in `page.tsx`, Server Actions, Route Handlers, or UI components.
- Not moving generic helpers out of `lib/`.
- Not using `waitUntilFinished` in request paths.
- Not one massive service object that owns unrelated capabilities.
- Not dependency injection everywhere for its own sake.

## Consequences

Benefits:

- Future work has bounded service areas.
- Agents and humans can inspect small public APIs.
- Business behavior is reviewable through service interfaces.
- Existing lint enforcement already protects `services/*/internal`.
- App Router routes stay readable as composition shells.
- Internal refactors stay local to a service.

Costs:

- New product services have a little ceremony.
- Service interface design becomes important.
- Some page-level orchestration files will coordinate several services; that is acceptable if business rules remain in services.
- Services can still be poorly shaped if they expose helper bags instead of product operations, so review should focus on the public API.
