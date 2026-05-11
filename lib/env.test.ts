import { afterEach, describe, expect, test, vi } from "vitest";

const REQUIRED_ENV = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/triage_os",
  REDIS_URL: "redis://localhost:6379",
  ANTHROPIC_API_KEY: "test-anthropic-key",
} as const;

async function loadEnvModule(env: Record<string, string | undefined>) {
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", env.DATABASE_URL);
  vi.stubEnv("REDIS_URL", env.REDIS_URL);
  vi.stubEnv("ANTHROPIC_API_KEY", env.ANTHROPIC_API_KEY);
  return import("./env");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("environment configuration", () => {
  test("loads required infrastructure configuration at import time", async () => {
    const { env } = await loadEnvModule(REQUIRED_ENV);

    expect(env).toEqual(REQUIRED_ENV);
  });

  test("requires the Anthropic API key", async () => {
    await expect(
      loadEnvModule({ ...REQUIRED_ENV, ANTHROPIC_API_KEY: undefined }),
    ).rejects.toThrow(/ANTHROPIC_API_KEY is required/);
  });
});
