<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Verification

Package manager is **pnpm**. Before committing, run `pnpm lint`, `pnpm exec tsc --noEmit`, and relevant tests.

# Components

This project uses shadcn/ui for components. The `components/ui` folder contains basic UI building blocks, and agents may add more shadcn/ui components there as needed. Refer to the shadcn skill before creating, modifying, or adding components.

## Agent skills

### Issue tracker

Issues and PRDs are tracked in GitHub Issues for `jennnx/propertylead-review-desk`. See `docs/agents/issue-tracker.md`.

### Triage labels

This repo uses the default mattpocock/skills triage label vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

This repo uses a single-context domain documentation layout. See `docs/agents/domain.md`.
