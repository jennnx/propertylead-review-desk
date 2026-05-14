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

Use Zod schemas for runtime validation of complicated objects at every service boundary: stored JSON, webhook payloads, provider responses, AI outputs (including tool-use call arguments returned by Claude), and raw SQL rows from `$queryRaw` (whose generic argument is only a TypeScript assertion, not runtime validation). Prefer schema `parse` or `safeParse` over hand-rolled property checks so validation, type inference, and future object-shape changes stay together. Never define a Zod schema alongside a parallel hand-rolled type — export types via `z.infer<typeof ...>` (and `Extract<...>` where you need a narrowed branch) so the schema is the single source of truth. Push cross-field business rules into `superRefine` and normalize the output shape with `.transform` rather than running imperative checks after `parse`, so the schema captures the full contract in one place.

`lib/` is only for small generic utilities reused everywhere by design, such as `env` and `utils`. It is not where product capabilities should accumulate.

For the full rationale, examples, and Next.js route guidance, see [ADR 0008](docs/adr/0008-vertical-services-and-deep-slices.md).

A service's public functions should describe their **product contract**, not the moving parts of their implementation. Inject only what genuinely varies in production. Test-only parameters — `fetch`, `now`, `log`, `errorLog`, `exit`, pluck-typed `Pick<Client, ...>` overrides, default-fallback client injections — do not belong in the signature; tests reach for module-level mocks (`vi.mock`, `vi.stubGlobal`, fake timers, `vi.spyOn`) instead. See [ADR 0012](docs/adr/0012-function-parameters-describe-product-contracts.md).

## Naming

Infrastructure and deployment docs currently use `Triage OS`. App metadata uses `PropertyLead Review Desk`. Until the product naming is reconciled, use existing terms deliberately and avoid inventing new names in architecture docs.

## Language

**HubSpot Webhook Event**:
An authenticated notification sent by HubSpot to the app before the app decides whether it represents a lead workflow.
_Avoid_: Lead, notification

**HubSpot Webhook Batch**:
One inbound HubSpot webhook request containing one or more HubSpot webhook events.
_Avoid_: Single event request

**HubSpot Integration**:
The app's only supported CRM integration, configured for exactly one company's HubSpot account.
_Avoid_: CRM integration, provider integration, multi-account installation

**HubSpot Webhook URL**:
The absolute endpoint HubSpot calls, derived from the app base URL and the HubSpot webhook route path.
_Avoid_: Callback URL, inferred URL

**HubSpot Webhook Processing Job**:
A queued processing unit associated with one stored target HubSpot Webhook Event.
_Avoid_: Task, generic job

**HubSpot Queue Processing**:
The service capability that claims stored HubSpot Webhook Processing Jobs,
loads their canonical HubSpot Webhook Event, delegates HubSpot-native workflow
handling, and marks the event processed or failed.
_Avoid_: Worker business logic

**HubSpot Workflows**:
The HubSpot-native application behavior that inspects HubSpot event payloads,
fetches additional HubSpot data, supplements it with app-owned data, and
decides the next HubSpot-facing steps.
_Avoid_: Generic CRM workflow, lead intake

**HubSpot Workflow Run**:
An operational record that PropertyLead Review Desk considered one stored HubSpot Webhook Event for HubSpot-native workflow handling.
_Avoid_: Lead state, enrichment table

**Enrichment Input Context**:
The bounded HubSpot and app-owned information PropertyLead Review Desk used when deciding whether and how to enrich a HubSpot contact.
_Avoid_: Contact mirror, CRM snapshot

**Current Conversation Session**:
The recent HubSpot Conversations message context PropertyLead Review Desk uses to reason about a triggering inbound message, aggregated across all of the contact's HubSpot Conversations threads rather than the triggering thread alone.
_Avoid_: Single-thread context, full conversation archive, arbitrary activity feed

**HubSpot Writeback Plan**:
A structured proposal that says which HubSpot fields should be updated, which HubSpot note should be created, or why no HubSpot writeback is needed.
_Avoid_: Direct AI writeback, final CRM state

**Writable HubSpot Property Catalog**:
The static, pre-approved set of HubSpot properties PropertyLead Review Desk may propose in HubSpot Writeback Plans.
_Avoid_: Dynamic property discovery, arbitrary AI-selected fields

**Operator**:
The real estate agent who uses PropertyLead Review Desk to watch the AI handle their leads, to decide whether each HubSpot Writeback Plan should be applied, and to author the SOP Documents that tell the AI how their business works. The operator is the primary audience for top-level UI surfaces (home/dashboard, Review Desk, SOP Library, anything in the main sidebar). Developers also use this app — for evals, diagnostics, prompt tuning, and other deep fine-tuning — but they are not the operator; developer-facing surfaces should stay visibly distinct from the operator's primary surfaces and should not appear in the operator's main flow.
_Avoid_: User, reviewer, manager (the operator is specifically the real estate agent)

**Review Desk**:
The internal trust-building workspace where the operator inspects Claude's HubSpot Writeback Plans, approves or rejects each one, and signals repeated mistakes back to the developer so prompts, SOPs, or code can improve. The Review Desk exists primarily to move the customer from "AI we don't yet trust" to "AI we let run"; in steady-state the Review Desk is barely used because Auto-Mode is on. It surfaces what triggered each HubSpot Workflow Run, what Claude proposed, and the context Claude reasoned over — not a HubSpot field editor.
_Avoid_: Inbox, lead queue, CRM editor, audit log (the audit/history view is part of the Review Desk, not a separate surface)

**Auto-Mode**:
A global PropertyLead Review Desk setting that, when enabled, causes newly produced HubSpot Writeback Plans to be applied to HubSpot without waiting for an operator approval. Auto-Mode is the intended steady-state of the app — the Review Desk's approval gate is fine-tuning scaffolding that exists to make Auto-Mode safe to leave on. Plans applied in Auto-Mode still surface on the Review Desk in the historical view with a clear indication they were auto-applied. Auto-Mode is read at plan-finalization time, not retroactively: plans already awaiting an operator decision when Auto-Mode is toggled on remain awaiting that decision.
_Avoid_: Auto-pilot, headless mode, silent writeback (Auto-Mode is still observable on the Review Desk)
_Operator UI copy_: shown to the operator as **Auto-approve**. When this toggle is on, AI suggestions enter the **auto-approved** state without an operator decision.

**HubSpot Writeback**:
The durable record of PropertyLead Review Desk's outbound mutation against HubSpot for a single HubSpot Workflow Run. A HubSpot Writeback is the integration-boundary peer of a HubSpot Webhook Event — webhook events represent HubSpot telling us something; HubSpot Writebacks represent us telling HubSpot something. Each HubSpot Writeback carries the HubSpot Writeback Plan produced by its run and records whether that plan was applied to HubSpot (by operator approval or by Auto-Mode), rejected by an operator, plus any optional operator feedback note left for the developer.
_Avoid_: Writeback action, application, mutation log (the HubSpot Writeback is the single durable record of the act); operator decision (the decision is a state on the HubSpot Writeback, not a separate entity)
_Operator UI copy_: shown to the operator as an **AI suggestion**, with states **approved** (APPLIED), **auto-approved** (AUTO_APPLIED), **rejected** (REJECTED), and **awaiting review** (PENDING). The code-side term "HubSpot Writeback" never appears in operator-facing surfaces; it is reserved for developer-facing surfaces and internal logs.

**SOP Document**:
A document the operator authors to tell the AI how their real-estate business works — the rules, playbooks, scripts, and judgement calls the operator wants the AI to follow when handling their leads. Operators upload SOP Documents as files (PDF, Markdown, plain text); PropertyLead Review Desk chunks and embeds them and supplies the relevant pieces to Claude as part of the Enrichment Input Context for each HubSpot Workflow Run. From the operator's standpoint an SOP Document is *the operator teaching the AI their playbook*; the chunking, embedding, and retrieval-k details are implementation concerns and stay off operator-facing surfaces.
_Avoid_: Knowledge base article, RAG document, embedded document, prompt fragment (these are implementation framings, not operator framings)
_Operator UI copy_: shown as the operator's **rules for the AI** or **playbook**. The SOP Library is the surface where operators drag-and-drop their playbooks; processing internals (chunk counts, embedding status, retrieval-k) do not appear in operator-facing copy. When the AI ignores or misapplies an SOP, the operator should learn about it through Review Desk feedback ("the AI missed your rule X"), not by inspecting SOP internals.

**Review Desk Feedback Note**:
An optional free-text note an operator may attach to a HubSpot Writeback — most commonly on a rejection — explaining why Claude's plan was wrong, so the developer can adjust prompts, SOPs, or code. Feedback Notes exist for the developer's benefit during the trust-building phase; they do not influence HubSpot behavior and the rejection action itself never requires one.
_Avoid_: Rejection reason, operator comment, structured feedback category (notes are free text; no taxonomy in v1)
_Operator UI copy_: surfaced as **Give the AI feedback**. The operator-facing framing is that they are coaching the AI, even though in practice the note is read by the developer and does not feed back into Claude's prompts automatically. Within the same surface, the structured plan sections are labelled **What the AI wants to change** (HubSpot Writeback Plan), **Why the AI suggested this** (Claude Reasoning), and **Context used by the AI** (Enrichment Input Context — rendered as raw JSON; an honest "this is the technical input" framing rather than a polished summary).

## Relationships

- A **HubSpot Webhook Event** may later produce or update a lead review workflow, but ingestion does not decide that mapping.
- A **HubSpot Webhook Batch** contains one or more **HubSpot Webhook Events**.
- A **HubSpot Webhook Processing Job** is derived from its **HubSpot Webhook Event**; the event record is the canonical input.
- **HubSpot Queue Processing** consumes **HubSpot Webhook Processing Jobs** and delegates actual app behavior to **HubSpot Workflows**.
- A **HubSpot Webhook Event** may produce zero or one **HubSpot Workflow Run**.
- A **HubSpot Workflow Run** may produce zero or more AI runs and zero or more HubSpot writebacks.
- A **HubSpot Workflow Run** records the **Enrichment Input Context** used for audit and evaluation, not the current HubSpot contact state.
- For inbound messages, **Enrichment Input Context** includes the **Current Conversation Session** drawn from all of the contact's HubSpot Conversations threads, capping to the latest 30 messages overall by default and preserving HubSpot message metadata such as actor IDs, direction, text or rich text, timestamps, and truncation status.
- A **HubSpot Writeback Plan** is validated and executed by PropertyLead Review Desk; Claude may propose the plan but does not own execution policy.
- A **HubSpot Writeback Plan** stored by this app does not by itself imply a pending HubSpot writeback.
- A **HubSpot Writeback Plan** either proposes at least one HubSpot field update or note, or gives a no-writeback reason; field updates and a note may appear together, but proposed writes and no-writeback reasoning are mutually exclusive.
- Field updates in a **HubSpot Writeback Plan** must target properties from the static **Writable HubSpot Property Catalog**.
- Setup may automatically create missing PropertyLead-owned HubSpot properties from the **Writable HubSpot Property Catalog**; runtime workflow processing does not dynamically create properties.
- If PropertyLead Review Desk cannot produce a valid **HubSpot Writeback Plan**, the **HubSpot Workflow Run** fails rather than treating the event as no-writeback-needed.
- A successful **HubSpot Workflow Run** may decide that no HubSpot writeback is needed.
- A duplicate delivery of an unprocessed stored **HubSpot Webhook Event** may repair or confirm its **HubSpot Webhook Processing Job**.
- A **HubSpot Integration** receives **HubSpot Webhook Events** from exactly one HubSpot account.
- A **HubSpot Integration** has exactly one **HubSpot Webhook URL**.
- A **HubSpot Workflow Run** that finalizes with a **HubSpot Writeback Plan** produces exactly one **HubSpot Writeback**, created eagerly at finalization. A run that decides no writeback is needed produces zero.
- A **HubSpot Writeback** is either applied to HubSpot — by operator approval or by **Auto-Mode** — or rejected by an operator. Rejections do not call HubSpot.
- A transient HubSpot API error during a **HubSpot Writeback** execution does not change the writeback's state; the error is surfaced inline to the operator so they can retry. PropertyLead Review Desk records no persisted failure state for the writeback and performs no automatic retry or rollback.
- A **HubSpot Writeback** may carry an optional **Review Desk Feedback Note**, attachable at any time after the writeback is decided.
- A **HubSpot Webhook Event** is the integration-boundary inbound record; a **HubSpot Writeback** is its outbound peer. **HubSpot Workflow Run** is internal processing state between them and never carries outbound execution status itself.

## Flagged ambiguities

- "HubSpot setup" means a HubSpot developer project with static auth, not a legacy private app UI setup.
- "task" was used to mean a queued **HubSpot Webhook Processing Job**, not a separate durable domain model.
- Unsupported or already processed duplicate HubSpot webhook events can be accepted at the HTTP boundary without producing a new **HubSpot Webhook Processing Job**.
