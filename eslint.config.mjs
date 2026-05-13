import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const prismaClientPattern = {
  group: ["@prisma/client"],
  message:
    "ADR 0009: @prisma/client may only be imported from services/**/internal/queries.ts, services/**/internal/mutations.ts, and services/database/**.",
};

const getPrismaClientPattern = {
  group: ["@/services/database", "**/services/database"],
  importNames: ["getPrismaClient"],
  message:
    "ADR 0009: getPrismaClient may only be imported from services/**/internal/queries.ts, services/**/internal/mutations.ts, and services/database/**.",
};

const crossServiceInternalsPattern = {
  group: [
    "@/services/*/internal",
    "@/services/*/internal/*",
    "@/services/*/internal/**",
  ],
  message:
    "Import from the service module root (e.g. @/services/database) instead of its internals.",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Global rule: enforces deep-module discipline (cross-service-internals)
    // and ADR 0009 (no direct @prisma/client or getPrismaClient outside the
    // colocated data-access layer).
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            crossServiceInternalsPattern,
            prismaClientPattern,
            getPrismaClientPattern,
          ],
        },
      ],
    },
  },
  {
    // Files inside `services/**` can reach into their own `internal/` to wire
    // a module's pieces together; the ADR 0009 prohibitions still apply so
    // that orchestration files in non-allowlisted locations stay clean.
    // (`no-restricted-imports` does not merge across flat-config blocks, so
    // we redefine the rule with only the patterns that still apply here.)
    files: ["services/**/*.ts", "services/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [prismaClientPattern, getPrismaClientPattern],
        },
      ],
    },
  },
  {
    // ADR 0009 allowlist: queries.ts, mutations.ts, and services/database/**
    // own the direct database access surface. Inside these files
    // `@prisma/client` and `getPrismaClient` are the entire point, so the
    // rule is off.
    files: [
      "services/**/internal/queries.ts",
      "services/**/internal/mutations.ts",
      "services/database/**",
    ],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".sandcastle/worktrees/**",
    // Worker build output (see worker/tsconfig.json -> outDir).
    "dist/**",
  ]),
]);

export default eslintConfig;
