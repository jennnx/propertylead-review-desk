# 0014 — HubSpot Writeback is an outbound integration-boundary entity, and the Review Desk is trust-building scaffolding

**Status**: Accepted

## Context

Up to this ADR, the enrichment pipeline ended with `services/hubspot-workflows`
finalizing a HubSpot Workflow Run whose `outcome` was either
`NO_WRITEBACK_NEEDED` or `WRITEBACK_PROPOSED`. A `WRITEBACK_PROPOSED` run
stores a validated HubSpot Writeback Plan but there is no code path that
applies that plan against HubSpot, no operator surface to act on it, and no
record of what HubSpot did with it.

CONTEXT.md already asserts the key invariant: *"A HubSpot Writeback Plan
stored by this app does not by itself imply a pending HubSpot writeback"* and
*"Claude may propose the plan but does not own execution policy."* The next
step is to fill in the missing half — the *execution* half — without
inventing a competing source of truth for HubSpot state (ADR 0010) and
without diluting the role of the Workflow Run as an internal-processing
artifact.

Two non-obvious framing facts shape this ADR and need to be written down so
future readers do not redesign the surface from first principles:

1. **The application is built for one customer.** Operator volume is
   hand-touchable. The operator is, in practice, the real estate agent or
   manager working alongside the developer. There is no auth, no multi-tenant
   plan, and no need to model concurrent operators.

2. **The Review Desk is trust-building scaffolding, not the permanent product
   center.** Its purpose is to take the customer from "AI we don't yet trust"
   to "AI we let run." The steady-state of the app is Auto-Mode always on,
   the real estate agent working only in HubSpot, and the developer checking
   logs/cost/latency occasionally. The Review Desk's gating role is
   temporary; its persistent role is producing **signal back to the
   developer** about where Claude is wrong.

The obvious-looking design — extend `HubSpotWorkflowRun` with `reviewState`
and `executionState` columns, treat approval as another phase of the run,
push HubSpot writes through the existing BullMQ queue — was considered and
rejected. Reasons are captured under **Decision** and **Consequences**.

## Decision

### 1. HubSpot Writeback is a top-level entity at the integration boundary

Introduce **HubSpot Writeback** as a new domain entity, sibling to
HubSpot Webhook Event at the HubSpot integration boundary. HubSpot Webhook
Events represent HubSpot telling us something; HubSpot Writebacks represent
us telling HubSpot something. The HubSpot Workflow Run remains a purely
internal-processing artifact between them and does not carry outbound
execution status.

A HubSpot Writeback owns the lifecycle of an outbound mutation against
HubSpot for one HubSpot Workflow Run. It carries the operator (or
Auto-Mode) decision and, when applied, the fact that HubSpot was called.

Rejected alternative: extend `HubSpotWorkflowRun` with review/execution
columns. This conflates internal processing with outbound integration, makes
the Run write-many instead of write-once, and forces every read of the Run
to filter on what part of its lifecycle it is in. The Run's role as
"system-to-system: here is what we should do" stays clean only if it does
not also carry "and here is what we did about it in the outside world."

### 2. Ownership lives in a new vertical service: `hubspot-writebacks`

A new service `services/hubspot-writebacks` owns the HubSpot Writeback
entity: its lifecycle transitions, its persistence orchestration, its
HubSpot write call, and the operator-facing read API the Review Desk
consumes. Per ADR 0008, this is a vertical slice: one capability end to end.
Per ADR 0009, reads and writes live in colocated `queries.ts` and
`mutations.ts`. Per ADR 0011, catalog validation runs inside this service
before any HubSpot call.

`hubspot-workflows` does not grow to own HubSpot writes. Its scope stays:
inspect event, fetch enrichment context, ask Claude, produce a validated
plan, finalize the Run.

### 3. HubSpot Writebacks are created eagerly on workflow finalization

When `hubspot-workflows` finalizes a Run with `outcome = WRITEBACK_PROPOSED`,
it calls into `hubspot-writebacks` to create a HubSpot Writeback in a
pending-decision state. A Run with `outcome = NO_WRITEBACK_NEEDED` produces
no HubSpot Writeback at all — there is nothing outbound to record.

Eager creation makes "pending operator decision" a queryable, indexable
state with a creation timestamp, rather than the absence of a row. The
Review Desk's queue becomes a direct read of HubSpot Writebacks in the
pending state; it does not require an anti-join against Workflow Runs.

A HubSpot Workflow Run produces at most one HubSpot Writeback. Re-trying a
failed run produces a new run and therefore a new writeback; there is no
1-to-many between runs and writebacks.

### 4. Writeback execution is synchronous against HubSpot, not queued

When a HubSpot Writeback is approved — either by an operator action on the
Review Desk or by Auto-Mode at workflow finalization — the call to HubSpot
happens synchronously inside the same request (for operator actions) or the
same worker job (for Auto-Mode). It is not enqueued onto BullMQ as a
separate job.

Reasoning is deliberately single-customer:

- The operator is at the surface and can react immediately to success or
  failure. Asynchronous "applying…" states would be infrastructure for a
  problem we do not have.
- Inbound HubSpot work goes through BullMQ because nothing is waiting on
  it. Outbound work has a human (or an immediate worker continuation)
  staring at the result; the symmetry argument does not apply.
- A separate execution queue introduces an in-flight state and a worker
  registration that buy nothing for the single-customer case and that we
  would have to display, reason about, and test.

Catalog validation per ADR 0011 still runs *before* the synchronous call;
plans that would fail validation never reach HubSpot.

### 5. Transient HubSpot errors do not change Writeback state

A 4xx/5xx or timeout from HubSpot during execution is surfaced inline to
the operator (or, in Auto-Mode, logged) and **the HubSpot Writeback is
left exactly as it was**. There is no persisted "failed" execution state on
the Writeback, no automatic retry, no acknowledgement transition, and no
attempt-rollback bookkeeping.

The operator's recourse is to retry the action. If the failure persists or
indicates something other than a transient HubSpot issue, the operator
re-triggers the workflow upstream (which produces a new Run and a new
Writeback) or hand-edits HubSpot. This is acceptable because:

- The app is single-customer and the operator is present.
- A failed HubSpot writeback is not a failed Workflow Run: Claude and our
  validation succeeded; HubSpot's API momentarily did not. Conflating them
  pollutes both surfaces.
- Persisted failure state, retry policy, and partial-application
  reconciliation are an entire policy minefield (idempotency, ordering,
  rate-limit interaction) that we do not need to enter to serve one
  customer.

If we ever do need persisted retry/attempt state, it is additive: a new
`HubSpotWritebackAttempt` table can be introduced without changing the
identity of the HubSpot Writeback. Until then, the simpler model holds.

### 6. Auto-Mode is a global toggle; the approval gate is its scaffold

Auto-Mode is a global boolean setting on the application. When enabled, a
newly finalized HubSpot Writeback is applied immediately, without waiting
for an operator decision. When disabled, the writeback sits pending until
an operator approves or rejects it.

Two behaviors are load-bearing:

- **The toggle is read at workflow finalization, not retroactively.** A
  HubSpot Writeback that was already pending when Auto-Mode is enabled
  stays pending. Auto-Mode never silently drains an operator backlog.
- **Auto-Mode does not hide writebacks from the Review Desk.** Auto-applied
  writebacks appear in the Desk's history view with a clear marker. The
  Desk is the single durable surface for both pending decisions and
  decided writebacks.

Auto-Mode is the *intended steady-state* of the app. The default-off
approval gate exists so an operator can fine-tune Claude with the developer
during early deployment and then flip Auto-Mode on once Claude is trusted.
The Review Desk's UI, queue, history, and feedback affordance should be
built with this trajectory in mind: this is scaffolding, not a permanent
operations center.

### 7. Rejection is feedback-bearing; approval and feedback are decoupled

A HubSpot Writeback may carry an optional **Review Desk Feedback Note** —
free text, no taxonomy. Notes exist primarily so an operator who rejects a
plan can tell the developer *why Claude was wrong*, which is the most
important signal the Desk produces. The note is the durable artifact of
trust-building.

Constraints:

- A note is never required. Rejection is a single non-blocking action;
  there is no modal interruption, no required field.
- A note can be attached after the decision. The rejection decision and
  the feedback note are independent fields; an operator can reject now and
  add the explanation later.
- No structured rejection taxonomy is introduced in v1. If patterns emerge
  in real notes, a taxonomy can be added later with knowledge of what to
  categorize.

## Consequences

- The Review Desk has one read surface and the operator's mental model
  matches the data model: webhook events come in, workflow runs decide what
  Claude proposes, and HubSpot Writebacks record what was done with those
  proposals. Each layer has one job.
- `services/hubspot-workflows` does not learn to write to HubSpot. Its
  scope stays small and its tests stay focused on enrichment and plan
  generation.
- The Review Desk has no in-flight states (no "applying", no "queued for
  HubSpot"). The lifecycle is small enough to display on a single row.
- The cost of synchronous execution is that the operator action — or the
  workflow worker job, in Auto-Mode — blocks on HubSpot for the duration
  of the API call. For a single-customer deployment this is acceptable and
  observable. If volume or HubSpot latency ever makes this painful, the
  decision becomes "introduce a writeback worker", not "reshape the
  domain."
- The cost of no persisted failure state is that we cannot answer "how
  often does HubSpot reject our writebacks?" from the database alone. That
  question is answerable from worker logs in v1. If it becomes important,
  see the note in Decision (5) about additive attempt records.
- Auto-Mode being a single global boolean means the operator cannot
  selectively auto-approve by event type, plan content, or contact
  segment. That is intentional — premature scoping invents UX for a
  problem we do not have. Scoping is additive when an operator can name
  the axis they actually want to slice on.
- Building the Review Desk as trust-building scaffolding rather than a
  permanent operations console means the design favors quick approve/reject
  flow, low-friction feedback capture, and surfacing of Claude's reasoning
  over evaluation dashboards, bulk actions, plan editing, or
  approval-with-caveats. Those are deferred until rejection feedback
  proves they are needed.
