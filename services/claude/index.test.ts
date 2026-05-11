import { describe, expect, test } from "vitest";

import { importWithRequiredEnv, REQUIRED_TEST_ENV } from "@/tests/env";

describe("Claude service", () => {
  test("exposes the supported Claude model registry with Sonnet as the default", async () => {
    const { CLAUDE_MODELS, DEFAULT_CLAUDE_MODEL } = await importWithRequiredEnv(
      () => import("./index"),
    );

    expect(CLAUDE_MODELS).toEqual({
      OPUS: "claude-opus-4-7",
      SONNET: "claude-sonnet-4-6",
      HAIKU: "claude-haiku-4-5-20251001",
    });
    expect(DEFAULT_CLAUDE_MODEL).toBe(CLAUDE_MODELS.SONNET);
  });

  test("exports a Claude API client configured from the required Anthropic API key", async () => {
    const { claude } = await importWithRequiredEnv(() => import("./index"));

    expect(claude.apiKey).toBe(REQUIRED_TEST_ENV.ANTHROPIC_API_KEY);
  });
});
