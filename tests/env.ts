import { vi } from "vitest";

import type { Env } from "@/lib/env";

export const REQUIRED_TEST_ENV = {
  APP_BASE_URL: "https://desk.example.com",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/triage_os",
  REDIS_URL: "redis://localhost:6379",
  ANTHROPIC_API_KEY: "test-anthropic-key",
  VOYAGE_API_KEY: "test-voyage-key",
  SOP_STORAGE_DIR: "/tmp/propertylead-review-desk/sops",
  HUBSPOT_CLIENT_SECRET: "test-hubspot-client-secret",
  HUBSPOT_ACCESS_TOKEN: "test-hubspot-access-token",
  LLM_TELEMETRY_SOURCE: "production",
} satisfies Env;

type TestEnvKey = keyof Env;
type TestEnvOverrides = Partial<Record<TestEnvKey, string | undefined>>;

export function stubRequiredEnv(overrides: TestEnvOverrides = {}) {
  const values = { ...REQUIRED_TEST_ENV, ...overrides };

  for (const [key, value] of Object.entries(values)) {
    vi.stubEnv(key, value);
  }

  return values;
}

export async function importWithRequiredEnv<TModule>(
  importModule: () => Promise<TModule>,
  overrides: TestEnvOverrides = {},
): Promise<TModule> {
  vi.resetModules();
  stubRequiredEnv(overrides);
  return importModule();
}
