# 0004 — Service modules expose a public root with implementation in `internal/`

**Status**: Accepted

## Context

Most Next.js apps start with a flat `lib/` folder where everything is importable from everywhere. That works until the codebase is big enough that callers start reaching into other modules' implementation details — a typical change goes from "rename a function" to "rename a function plus update 14 import sites in unrelated files."

We expect this project to grow: CRM integration, Claude calls, RAG, eval pipelines. Each will become its own service with internals that should not be visible to the rest of the app.

The standard "deep module" pattern is to give each service a single public API surface and hide everything else. The question is how to enforce it without manual review.

## Decision

Every service lives at `services/<name>/` with this shape:

```
services/<name>/
  index.ts              ← the public API surface; only this is importable from outside
  internal/             ← implementation; nothing outside services/** may import from here
    client.ts
    checks.ts
    ...
```

A `no-restricted-imports` ESLint rule (`eslint.config.mjs`) blocks any import path matching `@/services/*/internal/**` from outside `services/**`. Files inside `services/**` are exempt so a module can compose its own pieces.

## Consequences

- A new caller has exactly one import path to learn per service: `import { ... } from "@/services/database"`. They cannot accidentally couple to an internal helper because lint refuses.
- Refactoring an internal helper is local to one service. No cross-codebase ripple.
- The cost is one extra directory layer when you create a new service. Cheap.
- If a service ever grows large enough to extract to its own package (`@triage-os/database` published to a private registry), the existing import sites already point at the public root — they will not need to change. This was a deliberate consideration: we want the move-to-package story to be a one-line config change, not a codebase-wide refactor.
- Generic, dependency-free utilities (`lib/env.ts`, `lib/utils.ts`) stay in `lib/`. They are not deep modules; they are reused everywhere by design.
