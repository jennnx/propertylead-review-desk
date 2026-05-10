# syntax=docker/dockerfile:1.7
#
# Production application image for Triage OS.
#
# One image is built and reused for three runtime roles in docker-compose.yml:
#   * web      — `pnpm start`        (Next.js production server)
#   * worker   — `pnpm worker:start` (compiled BullMQ worker from dist/)
#   * migrate  — `pnpm db:migrate`   (one-shot Prisma migration gate)
#
# The image therefore needs both the built Next.js output (`.next/`) and the
# compiled worker output (`dist/`), plus the Prisma schema and CLI so the
# migrate role can run `prisma migrate deploy`.

ARG NODE_IMAGE=node:20.19-alpine3.21
ARG PNPM_VERSION=10.9.0

# =============================================================================
# Stage 1: build — install deps, generate Prisma client, build Next + worker.
# =============================================================================
FROM ${NODE_IMAGE} AS build
ARG PNPM_VERSION
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

# Install dependencies first so this layer can cache across source changes.
# `postinstall` runs `prisma generate --no-hints`, so the Prisma schema must
# be present before `pnpm install`.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts
RUN pnpm install --frozen-lockfile

# Bring in the rest of the source and produce both build outputs.
COPY . .
RUN pnpm build && pnpm worker:build

# =============================================================================
# Stage 2: runner — minimal production image, shared by web/worker/migrate.
# =============================================================================
FROM ${NODE_IMAGE} AS runner
ARG PNPM_VERSION
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# node_modules is kept whole (incl. devDependencies) because the migrate role
# needs the Prisma CLI and prisma.config.ts is a TypeScript file the CLI loads
# at run time. Stripping dev deps would force a second `pnpm install` per role.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/tsconfig.json ./tsconfig.json

EXPOSE 3000

# Default to the web role; docker-compose.yml overrides `command` for the
# worker and migrate roles.
CMD ["pnpm", "start"]
