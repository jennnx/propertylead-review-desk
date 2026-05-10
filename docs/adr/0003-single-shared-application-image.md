# 0003 — One shared application image runs web, worker, and migrate

**Status**: Accepted

## Context

There are three runtime roles in the production stack: the Next.js web server, the BullMQ worker (see [ADR 0002](0002-worker-as-separate-process.md)), and a one-shot Prisma migration job. Two reasonable image strategies exist:

1. **Three separate images** — one per role. Each is minimal: web only has the Next.js output, worker only has `dist/`, migrate only has the Prisma CLI.
2. **One shared image** — built once, run three times with different `command` overrides. The image carries all three role's deps.

Option 1 sounds tighter (smaller per-image size) but introduces several real costs:

- Three-way version drift: a dependency upgrade has to be coordinated across three Dockerfiles.
- Three build pipelines to keep healthy in CI.
- Three install steps means three places `pnpm install` can fail subtly differently.

Option 2 is heavier per image but trades that for simplicity.

## Decision

One image built from `./Dockerfile`. The compose file's `x-app` anchor sets the shared `image` / `build` / `environment`, and each service overrides only the `command`:

| Service     | `command`             |
| ----------- | --------------------- |
| `migrate`   | `pnpm db:migrate`     |
| `web`       | `pnpm start`          |
| `worker`    | `pnpm worker:start`   |

`node_modules` ships intact (devDependencies included) so the migrate role has the Prisma CLI without a second install layer.

## Consequences

- The image is larger than it would need to be for any single role. We accepted this — disk is cheaper than build-pipeline complexity for a project this size.
- A single `pnpm install --frozen-lockfile` covers everything; lockfile changes can't drift between roles.
- Future role-specific images are possible later by extracting from the shared base. Not needed yet.
- One side effect worth knowing: `pnpm install` runs `prisma generate` via `postinstall` (see [ADR 0001](0001-prisma-7-adapter-pattern.md)), which requires `DATABASE_URL` to be set at *build time*. The Dockerfile passes a placeholder so the build is hermetic; the real URL arrives at runtime through compose's `environment` block.
