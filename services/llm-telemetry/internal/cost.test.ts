import { describe, expect, test } from "vitest";

import { importWithRequiredEnv } from "@/tests/env";

describe("LLM cost computation", () => {
  test("prices an Anthropic Sonnet 4.6 call across input/output/cache splits", async () => {
    const { computeLlmCallCostUsd } = await importWithRequiredEnv(() =>
      import("./cost"),
    );

    // 1,000,000 input + 100,000 output + 200,000 cache write + 500,000 cache read.
    // = 3.00 + 1.50 + 0.75 + 0.15 = 5.40 USD.
    const cost = computeLlmCallCostUsd("anthropic", "claude-sonnet-4-6", {
      inputTokens: 1_000_000,
      outputTokens: 100_000,
      cacheCreationTokens: 200_000,
      cacheReadTokens: 500_000,
    });

    expect(cost).toBeCloseTo(5.4, 10);
  });

  test("prices an Anthropic Opus 4.7 call across input/output/cache splits", async () => {
    const { computeLlmCallCostUsd } = await importWithRequiredEnv(() =>
      import("./cost"),
    );

    // 1,000,000 input + 100,000 output + 200,000 cache write + 500,000 cache read.
    // = 15 + 7.5 + 3.75 + 0.75 = 27.00 USD.
    const cost = computeLlmCallCostUsd("anthropic", "claude-opus-4-7", {
      inputTokens: 1_000_000,
      outputTokens: 100_000,
      cacheCreationTokens: 200_000,
      cacheReadTokens: 500_000,
    });

    expect(cost).toBeCloseTo(27, 10);
  });

  test("returns null when no pricing entry exists for the alias", async () => {
    const { computeLlmCallCostUsd } = await importWithRequiredEnv(() =>
      import("./cost"),
    );

    const cost = computeLlmCallCostUsd(
      "anthropic",
      "claude-future-model-unknown",
      {
        inputTokens: 1000,
        outputTokens: 1000,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      },
    );

    expect(cost).toBeNull();
  });
});

describe("Anthropic snapshot-to-alias normalization", () => {
  test("maps a dated snapshot back to its alias", async () => {
    const { resolveAnthropicAlias } = await importWithRequiredEnv(() =>
      import("./pricing"),
    );

    expect(
      resolveAnthropicAlias(
        "claude-sonnet-4-6-20251022",
        "claude-sonnet-4-6",
      ),
    ).toBe("claude-sonnet-4-6");
  });

  test("falls back to the requested alias when the response snapshot is unknown", async () => {
    const { resolveAnthropicAlias } = await importWithRequiredEnv(() =>
      import("./pricing"),
    );

    expect(
      resolveAnthropicAlias(
        "claude-sonnet-4-7-20290101",
        "claude-sonnet-4-6",
      ),
    ).toBe("claude-sonnet-4-6");
  });

  test("falls back to the requested alias when the response model is missing", async () => {
    const { resolveAnthropicAlias } = await importWithRequiredEnv(() =>
      import("./pricing"),
    );

    expect(resolveAnthropicAlias(null, "claude-opus-4-7")).toBe(
      "claude-opus-4-7",
    );
  });
});
