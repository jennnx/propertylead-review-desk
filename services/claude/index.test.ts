import { afterEach, describe, expect, test, vi } from "vitest";

const REQUIRED_ENV = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/triage_os",
  REDIS_URL: "redis://localhost:6379",
  ANTHROPIC_API_KEY: "test-anthropic-key",
} as const;

async function loadClaudeService() {
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", REQUIRED_ENV.DATABASE_URL);
  vi.stubEnv("REDIS_URL", REQUIRED_ENV.REDIS_URL);
  vi.stubEnv("ANTHROPIC_API_KEY", REQUIRED_ENV.ANTHROPIC_API_KEY);
  return import("./index");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Claude service", () => {
  test("exposes the supported Claude model registry with Sonnet as the default", async () => {
    const { CLAUDE_MODELS, DEFAULT_CLAUDE_MODEL } = await loadClaudeService();

    expect(CLAUDE_MODELS).toEqual({
      OPUS: "claude-opus-4-7",
      SONNET: "claude-sonnet-4-6",
      HAIKU: "claude-haiku-4-5-20251001",
    });
    expect(DEFAULT_CLAUDE_MODEL).toBe(CLAUDE_MODELS.SONNET);
  });

  test("exports a Claude API client configured from the required Anthropic API key", async () => {
    const { claude } = await loadClaudeService();

    expect(claude.apiKey).toBe(REQUIRED_ENV.ANTHROPIC_API_KEY);
  });
});
