<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Verification

Package manager is **pnpm**. Before committing, run `pnpm lint`, `pnpm exec tsc --noEmit`, and relevant tests.

# Testing

For environment schema tests, do not add one test per env var. Keep one representative required-variable test as a canary that import-time Zod validation is wired. Add more env tests only when there is behavior beyond ordinary schema validation.

# Architecture

We use vertical services and deep slices as the default architecture.
`docs/adr/0008-vertical-services-and-deep-slices.md` is required reading before changing product or service code.

Service orchestration files (`operations.ts`, `ingestion.ts`, `processing.ts`, `handle-*.ts`) must not import `getPrismaClient` from `@/services/database` or import from `@prisma/client`. All database access lives in colocated `queries.ts` (reads) and `mutations.ts` (writes). `docs/adr/0009-colocated-service-data-access-layers.md` is required reading; the **Failure mode** and **Resolution** sections show the exact anti-pattern and the fix.

# Components

This project uses shadcn/ui for components. The `components/ui` folder contains basic UI building blocks, and agents may add more shadcn/ui components there as needed. Refer to the shadcn skill before creating, modifying, or adding components.

## Agent skills

### Issue tracker

Issues and PRDs are tracked in GitHub Issues for `jennnx/propertylead-review-desk`. See `docs/agents/issue-tracker.md`.

### Triage labels

This repo uses the default mattpocock/skills triage label vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

This repo uses a single-context domain documentation layout. See `docs/agents/domain.md`.
