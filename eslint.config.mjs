import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Service modules are deep modules: callers (route handlers, worker
    // entrypoints, scripts) must import from the module root, not reach
    // into `internal/`. Files inside `services/**` are exempt below so a
    // module can still wire its own pieces together.
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/services/*/internal",
                "@/services/*/internal/*",
                "@/services/*/internal/**",
              ],
              message:
                "Import from the service module root (e.g. @/services/database) instead of its internals.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["services/**/*.ts", "services/**/*.tsx"],
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
