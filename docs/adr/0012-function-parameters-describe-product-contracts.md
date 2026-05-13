# 0012 — Function parameters describe product contracts, not test seams

**Status**: Accepted

## Context

ADR 0004 established the deep-module shape for services: a thin public root
at `services/<name>/index.ts`, with implementation hidden under `internal/`.
ADR 0008 extended that posture to product code: services expose business
operations, not bags of helpers; callers do not need to know how a capability
is plumbed underneath. The motivation in both ADRs is the same — callers
should see a small, stable interface; implementation details should be free
to change behind it.

Recent code has drifted in a way that looks like it preserves that boundary
but does not. Public functions still live behind a barrel, but their
parameter lists have grown to include the moving parts of their
implementation: a `fetch`, a `verify` function, a `log`, an `errorLog`, an
`exit`, a `now`, a pluck-typed `Pick<HubSpotClient, ...>`. These parameters
have one production caller each — the same default, every time — and exist
solely so a test can pass a vitest mock in place of a real value.

Concrete examples from the codebase at the time of this ADR:

- `services/hubspot/internal/boot.ts` —
  `verifyWritableHubSpotPropertyCatalogOnBoot({ verify, log, errorLog, exit, skip, processName })`.
  Every parameter except `processName` is a test seam.
- `services/hubspot/internal/client.ts` —
  `createHubSpotClient({ accessToken, baseUrl, fetch })`. Tests pass
  `fetch: vi.fn()`; no production caller varies any of these.
- `services/hubspot-workflows/internal/handle-webhook-event.ts` —
  `hubSpot?: Pick<HubSpotClient, "getContact"> & InboundMessageHubSpotClient`
  with a `defaultHubSpot` fallback. The `Pick<>` shape exposes which HubSpot
  methods the implementation happens to call.
- `services/hubspot-webhooks/internal/webhook-receipt.ts` —
  `now?: Date = new Date()` for stale-signature tests.
- `services/hubspot/internal/verify.ts` — `{ hubSpot, catalog }`; the
  `catalog` override exists only so a test can verify the algorithm against a
  synthetic catalog.

The cost is real. Each test-only parameter:

- Bleeds an implementation choice into the public type signature, so a
  refactor — switching the HTTP client, replacing a logger, changing which
  HubSpot methods are used — becomes a breaking change to callers.
- Pulls test assertions toward "called with this fetch / this client / this
  exit," which couple tests to wiring rather than behavior.
- Inverts the deep-module promise: instead of "the caller does not know how
  this is plumbed," the caller is now asked to construct or stub every
  moving part.

## Decision

**A function's parameter list describes its product contract. Inject only
what genuinely varies in production.**

A parameter belongs in the signature when at least two real callers pass
different values for it, or when a single caller varies it across runs in a
way the function needs to honor. Otherwise it is a test seam and does not
belong in the public shape of the function.

When a test needs to control something that is not a product contract — an
HTTP boundary, a clock, a database client, a logger, the process exit, a
provider SDK — the test reaches for module-level tools, not a new parameter:

- `vi.mock("@/services/<other-service>", ...)` for cross-service
  collaboration.
- `vi.stubGlobal("fetch", ...)` for HTTP boundaries.
- `vi.useFakeTimers()` / `vi.setSystemTime(...)` for clocks.
- `vi.spyOn(console, "error")` for logging assertions.
- `vi.spyOn(process, "exit")` for process-level effects.

The repo already does this in `services/queue/index.test.ts`
(`vi.mock("bullmq")`, `vi.mock("ioredis")`),
`services/hubspot-workflows/index.test.ts`
(`vi.mock("@/services/database")`, `vi.mock("@/services/claude")`), and
`services/sop/internal/retrieval.test.ts` (`vi.stubGlobal("fetch", ...)`).
That is the pattern; it should be the default.

### What stays as a parameter

- Real product inputs: a `documentId`, a `hubSpotWebhookEventId`, a
  `queryEmbedding`, a `k`.
- Real configuration that varies between callers: the queue `name` passed to
  `createQueue`, the `processor` passed to `createWorker`.
- Data the function genuinely needs to be told (not to fetch itself):
  `enrichmentInputContext`, the `RecordHubSpotWebhookEventInput[]` array.

### What does not

- HTTP clients, fetch implementations, database clients, SDK instances,
  module-level singletons (`hubSpot`, `claude`, `prismaClient`) when only one
  production value exists.
- Loggers, error reporters, exit functions.
- Clocks (`now`, `Date.now`, random seeds) when no production caller varies
  them.
- `Pick<TClient, "methodA" | "methodB">` plucks. If a function needs a
  service, it imports the service from its barrel.
- Default-fallback parameters whose default is the same module-level value
  the function would otherwise import.

### Where to test

Default to testing through the service barrel
(`services/<name>/index.test.ts`). Reach into `internal/` for tests only
when:

- the file is a pure transform with no external boundaries (e.g. prompt
  builders, validators, Zod schema modules), and
- it has a stable contract worth a focused test that the barrel-level test
  cannot reach without contorting the inputs.

Internal tests duplicating coverage that the barrel test already provides
should be folded into the barrel test.

## What this is not

- Not a ban on parameters or on dependency injection. Functions still take
  the inputs they need.
- Not a ban on factories that genuinely vary in production
  (`createQueue(name)`, `createWorker(name, processor)`).
- Not a directive to make every module global. A function that genuinely
  has two production shapes still takes that variation as a parameter.
- Not a mandate to delete every existing parameter overnight. The rule
  governs new code and the inventory captured by the remediation issue that
  cites this ADR.

## Consequences

- Public types stop leaking implementation choices. The HubSpot service can
  swap its HTTP client without changing callers' types. The workflow
  handlers can change which HubSpot methods they call without breaking the
  workflows service barrel.
- Tests verify behavior at the boundary the service actually exposes, not
  the wiring underneath. Refactors stop breaking unrelated tests.
- Cross-service tests start at the barrel and mock other services at the
  module level. This formalizes the contract between services as the public
  barrel surface, not the internal pluck shape.
- A small amount of `vi.mock` boilerplate moves from per-test DI plumbing
  into module-level mock blocks. The repo already does this; this ADR makes
  it the default rather than one of several patterns.
