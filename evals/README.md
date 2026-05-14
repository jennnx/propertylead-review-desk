# Evals

Developer-facing evaluation of PropertyLead Review Desk's HubSpot Writeback
Plan output, scored by an LLM judge (Claude Opus 4.7) against per-case
rubrics. Runs via [promptfoo](https://www.promptfoo.dev). Results are
local-only (CLI + local HTML report); nothing operator-facing changes.

This is the **tracer-bullet** slice of the broader eval workflow described
in PRD [#55](https://github.com/jennnx/propertylead-review-desk/issues/55).
The pipeline is wired end-to-end with one strong-signal `inbound.message`
case. `contact.created` dispatch, full dataset coverage, smoke subset, and
filter UX land in follow-up slices.

## Run it

```bash
pnpm eval
```

This calls the real `requestInboundMessageWritebackPlan` for every case in
`dataset` (defined in [`cases.ts`](cases.ts)), so each run exercises the
production prompt builder, tool schema, Zod validator, and retry loop.
That means each run **hits the Anthropic API and costs real money** — keep
the dataset small until you actually want to spend.

Credentials come from the existing root `.env` (`ANTHROPIC_API_KEY`); no
new env vars are introduced. If `ANTHROPIC_API_KEY` is set to an empty
string in your shell (the same gotcha hit during seed-data work in
[commit 68f5c67](https://github.com/jennnx/propertylead-review-desk/commit/68f5c67)),
either `unset ANTHROPIC_API_KEY` or use a `.env` loader that overrides
explicitly — promptfoo loads `.env` via dotenv with the same precedence.

After a run, open the HTML report:

```bash
pnpm exec promptfoo view
```

### First-time setup gotcha: `better-sqlite3` native bindings

promptfoo uses `better-sqlite3` as its results cache. pnpm 10 silently skips
its build script the first time you `pnpm install` (you'll see it in the
"Ignored build scripts" warning), so `pnpm eval` fails at startup with
`Could not locate the bindings file`. One-time fix from the repo root:

```bash
pnpm rebuild better-sqlite3
# or, to allow it permanently for this project:
pnpm approve-builds
```

## Why imports reach into `services/hubspot-workflows/internal/`

The provider in [`provider.ts`](provider.ts) imports
`requestInboundMessageWritebackPlan` directly from
`@/services/hubspot-workflows/internal/request-writeback-plan` instead of
the service's public barrel. The eval is a privileged consumer (like a
test, but live-API-touching), not another service — widening the service's
public surface for eval needs alone would be the tail wagging the dog.
The `evals/**` block in
[`eslint.config.mjs`](../eslint.config.mjs) makes this exception explicit.

## Files

- [`cases.ts`](cases.ts) — `EvalCase` discriminated union (mirrors the
  production Enrichment Input Context shapes one-for-one) and the dataset.
  Conversation messages allow partial fields; the provider fills sensible
  defaults so case authors don't write HubSpot-shaped JSON every time.
- [`format-plan.ts`](format-plan.ts) — pure formatter turning a
  `HubSpotWritebackPlanRequestResult` into judge-readable prose. Handles
  `writeback`, `no_writeback`, and `acceptedPlan === null` (rendered as
  `Decision: invalid_output` with validation errors).
- [`provider.ts`](provider.ts) — the custom promptfoo provider plus the
  reusable `evaluateCase`, `buildInboundMessageContext`,
  `buildInboundMessageTriggerSummary`, and `expandConversationMessage`
  helpers used by both the provider and `tests.ts`.
- [`tests.ts`](tests.ts) — turns `dataset` into promptfoo test rows,
  pre-computing each case's `triggerSummary` so the rubric template can
  interpolate `{{triggerSummary}}` independently of `{{output}}`.
- [`promptfooconfig.yaml`](promptfooconfig.yaml) — wires the custom
  provider, the test rows, and the Opus-4.7 judge.

Unit tests (`*.test.ts` in this directory) run as part of `pnpm test`.
They do **not** call Anthropic — `requestInboundMessageWritebackPlan` is
mocked so the suite is a pure shape contract.
