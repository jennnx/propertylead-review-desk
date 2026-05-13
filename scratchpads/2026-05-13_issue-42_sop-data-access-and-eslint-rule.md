# Issue #42 — Move SOP direct-Prisma calls into queries.ts/mutations.ts and enforce with ESLint

Issue link: https://github.com/jennnx/propertylead-review-desk/issues/42

Required reading already done: ADR 0008, ADR 0009 (especially the **Failure mode** and **Resolution** sections, c29707c), `AGENTS.md`.

## Goal in one sentence

Bring `services/sop` into compliance with ADR 0009, drop the last three non-service `getPrismaClient` callers, and turn on an ESLint rule that mechanically blocks future regressions across `services/**`, `app/**`, `scripts/**`, `worker/**`.

## Why these three pieces ship together

The rule, the SOP refactor, and the diagnostic-callsite cleanup validate each other:

- The lint rule going green with **zero exemptions** beyond the documented allowlist proves the SOP refactor and diagnostic cleanup are complete.
- The SOP refactor going green proves the rule is not over-broad (it doesn't fire on legitimate `queries.ts` / `mutations.ts` callsites).
- Splitting these into separate PRs creates a half-state where the lint rule fires on code the refactor hasn't gotten to yet, or vice versa.

## Current state (verified by reading the files)

`services/sop/internal/operations.ts`:
- Imports `Prisma` from `@prisma/client` (for `PrismaClientKnownRequestError` sniffing).
- Imports `getPrismaClient` from `@/services/database`.
- Inline calls: `sopDocument.create` (upload), `sopDocument.findMany` with `_count.chunks` include (list), `sopDocument.delete` with `select: { storagePath: true }` and `P2025` catch (delete), `sopDocument.update` with FAILED status (markUploadFailed).
- `getSopDocument` is `notImplemented()` — leave it that way; out of scope.

`services/sop/internal/ingestion.ts`:
- Imports `getPrismaClient` only (no `@prisma/client`).
- Inline calls: `sopDocument.findUnique`, `prisma.$transaction(async (tx) => { tx.sopChunk.deleteMany; tx.$executeRaw INSERT loop; tx.sopDocument.update -> READY })`, and a top-level `sopDocument.update` for FAILED.

`services/sop/internal/queries.ts`:
- Already has `findMostSimilarSopChunks` (Zod-parsed `$queryRaw` over pgvector). Imports `getPrismaClient`. Keep as-is.

`services/sop/index.test.ts`:
- Top-level `vi.mock("@/services/database", () => ({ getPrismaClient: () => ({ sopDocument: {...}, sopChunk: {...}, $queryRaw, $executeRaw, $transaction }) }))` with a hand-rolled `transaction.mockImplementation` that calls the callback with a fake tx that has `sopDocument`, `sopChunk`, `$executeRaw`.
- One test (`is a clear no-op when the SOP Document id does not exist`) imports `@prisma/client` at test time to construct a `PrismaClientKnownRequestError`. After the refactor, `deleteSopDocumentRow` returns `null` instead of throwing, so this import goes away.
- Many assertions check Prisma argument shapes (`expect(sopDocumentDelete).toHaveBeenCalledWith({ where, select })`, `expect(sopDocumentFindMany).toHaveBeenCalledWith({ orderBy, take: 50, include })`). After the refactor we assert on the *new* mock function names (e.g. `recordSopDocumentUpload`, `listRecentSopDocuments`) and on the **inputs to those functions** (domain-shaped), not on Prisma argument shapes.

`scripts/db-check.ts`, `worker/jobs/infra-smoke.ts`, `app/api/health/route.ts`:
- All three import `getPrismaClient` only to immediately pass `prisma` into `checkDatabaseReachable(prisma)` / `checkPgvectorInstalled(prisma)`. None of them use the client for anything else.
- After the refactor: drop the `getPrismaClient` import, drop the `const prisma = getPrismaClient()` line, call the checks with no args. `scripts/db-check.ts` keeps `disconnectPrismaClient` because it owns the process lifecycle.

`services/database/internal/checks.ts`:
- Both functions currently take `prisma: PrismaClient` and call `prisma.$queryRaw\`...\``. The refactor: drop the parameter, call `getPrismaClient().$queryRaw\`...\`` instead (or alias `prisma` locally). The `PrismaClient` type import stops being needed.

`services/database/index.ts`:
- Re-exports `checkDatabaseReachable`, `checkPgvectorInstalled`, `disconnectPrismaClient`, `getPrismaClient`, and the `PrismaClient` type. Type re-export stays. No signature change visible from this barrel except the parameterless checks (signature change is the caller-visible breaking change).

`eslint.config.mjs`:
- Has a single `no-restricted-imports` rule with `patterns: [{ group: ["@/services/*/internal", "@/services/*/internal/*", "@/services/*/internal/**"], message: ... }]`.
- A later block `{ files: ["services/**/*.ts", "services/**/*.tsx"], rules: { "no-restricted-imports": "off" } }` turns the rule off entirely inside `services/**` so internal cross-wiring works.
- Flat-config `no-restricted-imports` does **not** merge across blocks — every block replaces the rule wholesale. So the new rule has to live in a single options object that carries both the existing cross-service `patterns` block AND a new `paths` block (or expanded `patterns`) for `@prisma/client` / `@/services/database`'s `getPrismaClient`.

## Two implementation choices the user should weigh in on

These are real fork points where I want a call before I start. Everything else is mechanical.

### Choice A — How to express the Prisma/database allowlist in flat-config ESLint

Both options achieve the same end state. Pick on aesthetic / future-extensibility grounds.

**A1. One global rule + one services-internal override (recommended).**
A single global block lists every forbidden import (the existing `@/services/*/internal*` pattern plus `@prisma/client` and `getPrismaClient` from `@/services/database`). A second block, scoped to `files: ["services/**/internal/queries.ts", "services/**/internal/mutations.ts", "services/database/**"]`, redefines the rule with **only** the existing cross-service `internal/*` pattern (so queries/mutations files can import Prisma but still can't import each other's internals). A third block keeps the rest of `services/**` (orchestration files, tests inside services) blocked on Prisma but unblocked on cross-service internals — wait, that's hard to express in flat config without duplicating the rule.

Actually the cleanest version of A1 is:

- Global rule (applies to **all** TS/TSX): forbid `@/services/*/internal*` patterns AND forbid `@prisma/client` AND forbid `getPrismaClient`.
- Override for `services/**/*.ts(x)`: redefine rule to forbid only `@prisma/client` and `getPrismaClient` (keep the Prisma block, drop the `internal/*` block so services can wire themselves).
- Override for `services/**/internal/queries.ts`, `services/**/internal/mutations.ts`, `services/database/**`: turn `no-restricted-imports` off (or set it to only the `internal/*` cross-service pattern).

Pros: matches how `no-restricted-imports` actually composes in flat config (each block replaces, not merges). Each block reads as one cohesive rule.
Cons: three blocks of `no-restricted-imports` instead of one.

**A2. One single global rule that covers everything, no overrides.**
Define one global `no-restricted-imports` that lists both forbidden groups. Then **delete** the current `services/**` override that turns the rule off — instead, target the prohibition narrowly enough that it never fires inside `services/**` cross-wiring. The cross-service-internals pattern is already targeted; the Prisma prohibition is added as a global. Then the allowlist is expressed as additional override blocks that turn the rule off only on the three allowed locations.

This is essentially the same shape as A1 but trades the per-file overrides for a different mental model: "always on, except in the allowlisted files."

Pros: easier to summarize — "one rule, three allow-files."
Cons: cross-service internal imports are still forbidden inside services *except* for queries/mutations/services/database (which is wrong: every file inside `services/X` is allowed to reach into `services/X/internal/*`, even non-allowlisted ones). So A2 actually requires reintroducing the same override anyway. **In practice A1 and A2 collapse to the same shape.**

**Recommendation: A1.** Three flat-config blocks, each expressing one concern: global rules, services-cross-wiring exemption, queries/mutations/database-infra exemption. This is what I'll do unless you say otherwise.

### Choice B — Test rewrite scope

The issue mandates: delete the Prisma-client mock block; mock `./internal/queries` and `./internal/mutations` instead; assert on observable behavior, not Prisma argument shapes.

The grey area is **how much** to assert.

**B1. Mock the colocated query/mutation modules; keep test count and intent the same; reword assertions in domain terms.**
For each existing test, replace `expect(sopDocumentCreate).toHaveBeenCalledWith({ data: ... })` with `expect(recordSopDocumentUpload).toHaveBeenCalledWith({ originalFilename, contentType, byteSize, storagePath, id })` — i.e. assert on the input the orchestrator passes to the mutation, in domain shape. Same for `markSopDocumentFailed`, `markSopDocumentReady`, `replaceSopChunks`, `deleteSopDocumentRow`, `findSopDocumentById`, `listRecentSopDocuments`. The `$transaction`/`$executeRaw`/`sopChunkDeleteMany` mocks all disappear because `replaceSopChunks` is now one function call from the orchestrator's view.

**B2. Same as B1 but also drop assertions that pin internals.**
E.g. `expect(executeRaw).toHaveBeenCalledTimes(1)` becomes `expect(replaceSopChunks).toHaveBeenCalledWith(documentId, embeddedChunks)`. Tests that previously checked `transaction.mockImplementation(...)` machinery are gone entirely.

The issue body explicitly says "All assertions in `services/sop/index.test.ts` describe observable behavior, not Prisma argument shapes" — which is B2. **Going with B2.**

The trickier sub-question: the test `"deletes a PROCESSING SOP Document the same way as READY, leaving the cascade to clean any racing chunks"` currently asserts `sopDocumentFindUnique` was not called and `sopChunkDeleteMany` was not called. The intent there is "we don't do a read-then-delete dance and don't manually clean chunks". After the refactor, those concerns are encapsulated inside `deleteSopDocumentRow` (single mutation, schema cascade). The orchestrator can only call `deleteSopDocumentRow` and `removeStoredFileIfPresent` — there's no `findUnique` or `deleteMany` to assert against. The test's value collapses to "delete works for PROCESSING the same way as READY," which is essentially a dup of the READY test. **I'll keep one parametrized version that covers both states once, or drop the redundant case.**

## Plan, ordered

### Phase 1 — `services/sop` refactor (atomic)

1. Create `services/sop/internal/mutations.ts`:
   - `recordSopDocumentUpload(input): Promise<SopDocumentRow>` — wraps current `sopDocument.create`. Input shape mirrors the columns the orchestrator already builds (id, originalFilename, contentType, byteSize, storagePath, initial status PROCESSING, failureMessage null).
   - `markSopDocumentFailed(id, failureMessage): Promise<void>` — single function used by both `operations.ts` (`markUploadFailed`) and `ingestion.ts` (`markDocumentFailed`).
   - `markSopDocumentReady(id): Promise<void>` — *not used by callers directly* after Step 3 below; lives inside `replaceSopChunks`. Possibly keep as an internal helper inside `mutations.ts`, not exported. Decision deferred to implementation: if `replaceSopChunks` is the only caller, inline the update inside the same transaction (already does this) and don't export `markSopDocumentReady`.
   - `replaceSopChunks(documentId, chunksWithEmbeddings): Promise<void>` — owns the `$transaction`, the `tx.sopChunk.deleteMany`, the `$executeRaw` pgvector INSERT loop, and the `tx.sopDocument.update -> READY`. Input shape: `Array<{ ordinal: number; text: string; embedding: number[] }>`. The function generates the chunk ids (`randomUUID()`) so the orchestrator never owns row identity.
   - `deleteSopDocumentRow(id): Promise<{ storagePath: string } | null>` — returns `null` for the `P2025` not-found case so the orchestrator never sniffs Prisma errors. This is the ONLY place `Prisma.PrismaClientKnownRequestError` lives in the SOP service.

2. Expand `services/sop/internal/queries.ts`:
   - Add `findSopDocumentById(id): Promise<SopDocumentForIngestion | null>` — wraps `sopDocument.findUnique`. Return type is the fields ingestion actually reads (id, originalFilename? no — only `storagePath` and `contentType` are read by `ingestSopDocument` plus `id` for downstream). Decision: return the full document row (Prisma model shape, no `_count`), since the orchestrator only reads a couple of fields and there's no benefit to a narrower projection. Document the type with an exported `SopDocumentForIngestion` so the orchestrator imports a domain type, not a Prisma model type.
   - Add `listRecentSopDocuments(limit): Promise<SopDocumentSummaryRow[]>` — wraps `sopDocument.findMany` with `take: limit`, `orderBy: { uploadedAt: "desc" }`, `include: { _count: { select: { chunks: true } } }`. Returns a shape where `_count.chunks` has been **flattened to `chunkCount`** on the row, so the orchestrator's `mapDocument` doesn't need to know about `_count`. The orchestrator just maps `SopDocumentSummaryRow -> SopDocumentSummary` (drop `storagePath`).
   - Keep `findMostSimilarSopChunks` as-is.

3. Rewrite `services/sop/internal/operations.ts`:
   - Drop `import { Prisma } from "@prisma/client"`.
   - Drop `import { getPrismaClient } from "@/services/database"`.
   - Import from `./queries` and `./mutations` only.
   - `uploadSopDocument` calls `recordSopDocumentUpload({ id, originalFilename, contentType, byteSize, storagePath })`. On enqueue failure, calls `markSopDocumentFailed(id, toFailureMessage(error))` and `removeStoredFileIfPresent`.
   - `listSopDocuments` calls `listRecentSopDocuments(50)` and maps to `SopDocumentSummary[]`.
   - `deleteSopDocument` calls `deleteSopDocumentRow(id)`. If the result is `{ storagePath }`, unlink the file. If `null`, no-op.
   - `isPrismaRecordNotFoundError` helper goes away with the import.

4. Rewrite `services/sop/internal/ingestion.ts`:
   - Drop `import { getPrismaClient } from "@/services/database"`.
   - Import from `./queries` and `./mutations`.
   - `ingestSopDocument` calls `findSopDocumentById`, runs parsing + chunking + embedding (unchanged), then calls `replaceSopChunks(document.id, chunks.map((c, i) => ({ ordinal: c.ordinal, text: c.text, embedding: embeddings[c.ordinal] })))`. The orchestrator no longer assembles a transaction.
   - Top-level `markDocumentFailed` becomes a one-liner that calls `markSopDocumentFailed`.

5. Rewrite `services/sop/index.test.ts` (option B2 above):
   - Delete the `vi.mock("@/services/database", ...)` block and all the `sopDocumentCreate`/`sopDocumentFindMany`/`...`/`transaction.mockImplementation` machinery.
   - `vi.mock("./internal/queries", () => ({ findSopDocumentById: vi.fn(), listRecentSopDocuments: vi.fn(), findMostSimilarSopChunks: vi.fn() }))`.
   - `vi.mock("./internal/mutations", () => ({ recordSopDocumentUpload: vi.fn(), markSopDocumentFailed: vi.fn(), replaceSopChunks: vi.fn(), deleteSopDocumentRow: vi.fn() }))`.
   - Each test reaches the mocked functions via `vi.mocked(...)` after the dynamic `import("./index")`.
   - Assertions reframed in domain language:
     - Upload happy path: `recordSopDocumentUpload` was called with `{ id, originalFilename, contentType, byteSize, storagePath, processingStatus: "PROCESSING", failureMessage: null }` (or whatever domain shape we settle on), and `enqueueQueueJobWithRetries` was called with the right queue job.
     - Upload enqueue failure: `markSopDocumentFailed` was called with `(id, "redis unavailable")`, and the stored file was removed.
     - List: `listRecentSopDocuments` was called with `50`, return shape is mapped correctly.
     - Ingest happy path: `findSopDocumentById` called with id; `replaceSopChunks` called with `(id, [{ ordinal, text, embedding }, ...])`; no `markSopDocumentFailed` call.
     - Ingest empty-text path: `replaceSopChunks` never called; `markSopDocumentFailed` called with the right message.
     - Ingest PDF corrupt path: same shape as empty-text.
     - Ingest embedding retry: fetch called 3 times; `replaceSopChunks` never called; `markSopDocumentFailed` called with the 503 message.
     - Delete (READY/PROCESSING): `deleteSopDocumentRow` called; storage unlinked. **Collapse the redundant PROCESSING case** unless it tests something the READY case doesn't.
     - Delete (not found): `deleteSopDocumentRow` resolves `null`; orchestrator resolves `undefined`; no storage unlink. **No more `@prisma/client` import in the test.**
     - Delete (ENOENT on unlink): `deleteSopDocumentRow` resolves `{ storagePath }`; storage unlink throws ENOENT; orchestrator swallows it.
     - Delete (unexpected error): `deleteSopDocumentRow` rejects with `new Error("connection refused")`; orchestrator propagates.
     - `retrieveRelevantSopChunks` tests: these go through `findMostSimilarSopChunks` (mocked) — no Prisma assertions needed. The current tests assert on `queryRaw`/Voyage fetch behavior; reframe Voyage fetch assertions in place, and `queryRaw` assertions become `findMostSimilarSopChunks` mock assertions.

6. Verify: `pnpm exec tsc --noEmit`, `pnpm test services/sop`. Expect Phase 1 alone to be green.

### Phase 2 — Diagnostic callsite cleanup

7. `services/database/internal/checks.ts`: drop the `prisma: PrismaClient` parameter from both functions; call `getPrismaClient().$queryRaw\`...\`` inside. Drop the `import type { PrismaClient }`. The `services/database/index.ts` barrel keeps re-exporting these (no name change).

8. `scripts/db-check.ts`: drop `getPrismaClient` from the import list; drop `const prisma = getPrismaClient()`; call `checkDatabaseReachable()` / `checkPgvectorInstalled()` with no args. Keep `disconnectPrismaClient` in the `finally` so the script still exits cleanly.

9. `worker/jobs/infra-smoke.ts`: drop `getPrismaClient` from the database import list; drop `const prisma = getPrismaClient()`; call the checks with no args.

10. `app/api/health/route.ts`: drop `getPrismaClient` from the database import list; drop `const prisma = getPrismaClient()`; call the checks with no args.

11. Verify: `pnpm exec tsc --noEmit`, `pnpm test`. Phase 1 + Phase 2 still green.

### Phase 3 — ESLint rule

12. Edit `eslint.config.mjs` (per Choice A1):
    - Global block (applies to everything): `no-restricted-imports` lists three forbidden things:
      - The existing cross-service-internals `patterns` block (`@/services/*/internal`, `@/services/*/internal/*`, `@/services/*/internal/**`).
      - `paths` block forbidding `@prisma/client` with the ADR 0009 message.
      - `paths` block forbidding the named import `getPrismaClient` from `@/services/database` with the ADR 0009 message.
    - Override block scoped to `files: ["services/**/*.ts", "services/**/*.tsx"]`: redefines `no-restricted-imports` to only the Prisma/database `paths` block (so services can cross-wire their own internals but not import Prisma).
    - Override block scoped to `files: ["services/**/internal/queries.ts", "services/**/internal/mutations.ts", "services/database/**"]`: redefines `no-restricted-imports` to only the cross-service-internals `patterns` block (so queries/mutations/database-infra can import Prisma but still can't reach into sibling services' internals).
    - The rule now applies to `app/**`, `scripts/**`, `worker/**` automatically (via the global block) with no further configuration.

13. Verify the rule fires before-and-after:
    - Stash a temporary copy of pre-refactor `services/sop/internal/operations.ts` (or just a synthetic file) and confirm `pnpm lint` errors with the new rule.
    - Then verify `pnpm lint` is **green with zero exemptions** on the post-refactor tree.

14. Verify the rule doesn't require new exemptions for `services/hubspot-webhooks`, `services/hubspot-workflows`, `services/hubspot-queue-processing`:
    - `hubspot-webhooks/internal/mutations.ts` imports `Prisma` and `getPrismaClient` — both inside `mutations.ts`, allowlisted.
    - `hubspot-workflows/internal/mutations.ts` — same.
    - `hubspot-queue-processing/internal/queries.ts` and `mutations.ts` — same.
    - Test files for those services (`*.test.ts` at the service root) — none of them import `@prisma/client` or `getPrismaClient` directly except the sop test (which gets cleaned up in Phase 1). Verify by grep.

### Final verification

15. `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test` all green.
16. `claude-helper precommit`.
17. PR review.

## Risks / edge cases I'm tracking

- **Test ordering / `vi.mock` hoisting.** `vi.mock("./internal/queries", ...)` runs before module evaluation, but if the mock factory references variables they must be declared with `vi.hoisted(...)` or named at the top of the file. The current test does the same pattern with `vi.fn()` references declared above the `vi.mock` call — the pattern works because Vitest hoists the `vi.mock` call but keeps the factory body as a closure over already-declared `vi.fn()` references. Reuse that pattern.
- **`SopDocumentForIngestion` type.** Tempting to return the full Prisma `SopDocument` model from `findSopDocumentById`, but that re-leaks Prisma types into the orchestrator. Define an exported domain type in `queries.ts` with exactly the columns ingestion reads. Same for `SopDocumentSummaryRow` from `listRecentSopDocuments`.
- **`replaceSopChunks` input shape.** Don't accept the chunker's output and the embeddings as two separate arrays — the orchestrator already has to zip them. Accept the zipped shape `Array<{ ordinal, text, embedding }>` so the mutation never reasons about ordinal/embedding alignment.
- **Schema cascade for delete.** ADR 0009's resolution snippet assumes `sopChunk` is deleted by the FK cascade on `sopDocument`. The existing test (`removes a READY SOP Document row and its stored file bytes, relying on the schema cascade for chunks`) confirms this is the live behavior. `deleteSopDocumentRow` does not need to manually `deleteMany` chunks.
- **ESLint flat-config rule replacement semantics.** Already covered in Choice A; need to be careful that the file-pattern overrides cover the exact set of files and nothing else. Verify by lint output.
- **`pnpm test:e2e` is referenced in the issue template but does not exist in `package.json`.** No-op. `pnpm test` is the full suite.
- **No `pnpm check` script.** `AGENTS.md` says `pnpm lint && pnpm exec tsc --noEmit && pnpm test`. I'll run all three.

## Open questions for you

1. **Choice A vs A2 above (ESLint composition).** I'm planning to do A1. Anything you want different?
2. **Test rewrite scope (B1 vs B2).** Going with B2 per the acceptance criteria. Anything you want kept that B2 would drop?
3. **`getSopDocument` is `notImplemented()`.** I'm leaving it. Out of scope for this issue. OK?
4. **Should I keep `markSopDocumentReady` as an exported mutation or inline it inside `replaceSopChunks`?** Issue body suggests both; cleanest is to inline (the issue says `replaceSopChunks` "owns its `$transaction`, the `tx.sopChunk.deleteMany`, the `tx.$executeRaw` pgvector INSERT loop, **and the `tx.sopDocument.update` to mark `READY`**"). I'll inline it and not export `markSopDocumentReady`.

If those four answers match what you'd write, this is unblocked. Otherwise, ping me and I'll adjust before any code moves.
