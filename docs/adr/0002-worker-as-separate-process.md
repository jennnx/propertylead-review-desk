# 0002 — Worker runs as a separate Node process from the web server

**Status**: Accepted

## Context

The natural-feeling default in a Next.js app is to spawn background work from a route handler — kick off a Promise, return 200, let it run. That works until it doesn't:

- A long-running job blocks the request-handling event loop.
- A crash in the job restarts the whole web container; in-flight HTTP requests get cut off.
- Scaling the web tier scales the job tier whether you want it or not.
- The serverless deployment story (Vercel, etc.) explicitly does not allow it — functions die when the response is sent.

We expect real workloads (CRM enrichment, LLM calls, embedding generation) to take seconds to minutes per job, which makes "inline in the request" structurally wrong.

## Decision

The BullMQ worker is a **separate Node OS process**, not a child process and not a route-handler side-effect. The web server only enqueues jobs; the worker consumes them.

- Entry point: `worker/index.ts`, compiled to plain JavaScript via its own `worker/tsconfig.json` (the rest of the project is `noEmit` because Next.js handles bundling).
- Production: `pnpm worker:start` runs `node dist/worker/index.js` as its own container in the compose stack.
- Development: `pnpm worker:dev` runs the TS source through `tsx` with watch mode, in a terminal alongside `pnpm dev`.

## Consequences

- Web and worker scale independently — you can run N web containers and M worker containers per their actual demand.
- A worker crash does not interrupt HTTP traffic; supervisor restarts the worker container alone.
- Developers must remember to start *two* processes locally (`pnpm dev` + `pnpm worker:dev`). This is the most common dev-environment "huh, my job isn't running" — covered in README's gotchas.
- The worker has its own compilation target (`dist/`). See [ADR 0003](0003-single-shared-application-image.md) for why the production image still ships both Next.js and worker outputs from the same build.
- This decision presumes self-hosted (Compose / Kubernetes) deployment. If we ever target serverless we'd need a different background-execution model (managed queue + functions).
