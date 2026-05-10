# 0006 — `infra.smoke` is a permanent diagnostic queue, and `waitUntilFinished` is restricted to verification

**Status**: Accepted

## Context

Deploying the worker is not the same as proving the worker is actually consuming jobs. A worker container can be `Up (healthy)` according to Docker — meaning the process started without crashing — and still be silently failing to process any work (wrong Redis URL, missed registration, BullMQ version mismatch). The only honest test is: enqueue a real job, wait, see that the worker picked it up.

Two design choices have to land together:

1. **What job do we enqueue?** A "test mode" of a real product queue would pollute live data. An ad-hoc job created just for the test means we need to construct a job type every time we deploy. Neither is ergonomic.
2. **How does the caller wait for the result?** BullMQ exposes `Job.waitUntilFinished(queueEvents, ttl)`, which blocks the caller until the job completes. That's exactly what we want for a verification script. It is also catastrophic if used inside a request handler — your request handler now blocks the event loop on a background job, defeating the whole point of having a worker.

## Decision

**A permanent diagnostic queue named `infra.smoke`** ships with the worker. Its processor (`worker/jobs/infra-smoke.ts`) runs read-only probes against Redis, Postgres, and pgvector, then returns a structured `InfraSmokeResult`. It does not touch any product/domain data; that is the point.

**`waitUntilFinished` is allowed in exactly one place: `scripts/queue-verify.ts`.** Convention enforced through the script's name and its location outside `services/**` — anyone proposing to call `waitUntilFinished` from a route handler should be stopped at review and pointed at this ADR.

**The job is configured with `removeOnComplete: true` / `removeOnFail: true`** so post-deploy runs don't accumulate diagnostic records in production Redis. The structured result is captured via the `QueueEvents` `completed`/`failed` event, not by re-reading the job record after the fact, so removal does not break verification.

## Consequences

- `pnpm queue:verify` is the canonical "is the deployed worker actually working?" check. CI / deploy pipelines can call it directly and get a non-zero exit code on any failure.
- The `infra.smoke` job stays permanently because there is never a moment in the project's life when we wouldn't want to be able to probe the live worker.
- A future "is the LLM call path healthy?" probe should add its own diagnostic job (e.g. `infra.llm-probe`), not piggyback on `infra.smoke`. Each probe owns its own scope.
- If a tracer slice needs to legitimately wait for a background result (e.g. an eval pipeline driver), it must build that behavior out of streaming/polling, not `waitUntilFinished`. The latter remains restricted.
