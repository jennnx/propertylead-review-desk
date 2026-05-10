// Prisma 7 configuration. Centralises the connection URL for migration
// commands; runtime PrismaClient gets its connection through a driver
// adapter (see scripts/db-check.ts).
//
// `prisma migrate ...` reads `datasource.url` from this file rather than
// from `prisma/schema.prisma`. `prisma generate` does not need the URL,
// so a placeholder is used when DATABASE_URL is absent — migrate commands
// will still fail loudly because the placeholder host is not resolvable.

import { config as loadDotenv } from "dotenv";
import { defineConfig } from "prisma/config";

loadDotenv();

const GENERATE_PLACEHOLDER_URL =
  "postgresql://placeholder:placeholder@invalid.localhost:5432/placeholder";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? GENERATE_PLACEHOLDER_URL,
  },
});
