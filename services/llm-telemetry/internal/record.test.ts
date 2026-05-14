import { beforeEach, describe, expect, test, vi } from "vitest";

import { importWithRequiredEnv } from "@/tests/env";

const insertLlmCall = vi.fn();

vi.mock("./mutations", () => ({
  insertLlmCall,
}));

describe("recordLlmCall", () => {
  beforeEach(() => {
    insertLlmCall.mockReset();
    insertLlmCall.mockResolvedValue(undefined);
  });

  test("records a successful Anthropic call with normalized alias, computed cost, and source tag", async () => {
    const { recordLlmCall } = await importWithRequiredEnv(() =>
      import("./record"),
    );

    await recordLlmCall({
      provider: "anthropic",
      requestedModelAlias: "claude-sonnet-4-6",
      responseModelSnapshot: "claude-sonnet-4-6-20251022",
      usage: {
        inputTokens: 1_000,
        outputTokens: 500,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      },
      latencyMs: 824,
      source: "production",
      status: "ok",
    });

    expect(insertLlmCall).toHaveBeenCalledTimes(1);
    const row = insertLlmCall.mock.calls[0][0];
    expect(row).toMatchObject({
      provider: "ANTHROPIC",
      modelAlias: "claude-sonnet-4-6",
      modelSnapshot: "claude-sonnet-4-6-20251022",
      source: "PRODUCTION",
      inputTokens: 1_000,
      outputTokens: 500,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalTokens: null,
      latencyMs: 824,
      status: "OK",
      errorMessage: null,
      hubSpotWorkflowRunId: null,
      sopDocumentId: null,
    });
    // 1000 * 3/1e6 + 500 * 15/1e6 = 0.003 + 0.0075 = 0.0105
    expect(row.costUsd).toBeCloseTo(0.0105, 10);
  });

  test("records an error call with status ERROR and null cost", async () => {
    const { recordLlmCall } = await importWithRequiredEnv(() =>
      import("./record"),
    );

    await recordLlmCall({
      provider: "anthropic",
      requestedModelAlias: "claude-sonnet-4-6",
      responseModelSnapshot: null,
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      },
      latencyMs: 42,
      source: "production",
      status: "error",
      errorMessage: "connection refused",
    });

    expect(insertLlmCall).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "ANTHROPIC",
        status: "ERROR",
        errorMessage: "connection refused",
        costUsd: null,
      }),
    );
  });

  test("records cost as null when alias has no pricing entry, while still emitting the row", async () => {
    const { recordLlmCall } = await importWithRequiredEnv(() =>
      import("./record"),
    );

    await recordLlmCall({
      provider: "anthropic",
      requestedModelAlias: "claude-future-unknown",
      responseModelSnapshot: "claude-future-unknown-20290101",
      usage: {
        inputTokens: 100,
        outputTokens: 100,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      },
      latencyMs: 200,
      source: "production",
      status: "ok",
    });

    expect(insertLlmCall).toHaveBeenCalledWith(
      expect.objectContaining({
        modelAlias: "claude-future-unknown",
        modelSnapshot: "claude-future-unknown-20290101",
        costUsd: null,
      }),
    );
  });

  test("tags the row with the eval source when called from an eval-flagged context", async () => {
    const { recordLlmCall } = await importWithRequiredEnv(() =>
      import("./record"),
    );

    await recordLlmCall({
      provider: "anthropic",
      requestedModelAlias: "claude-sonnet-4-6",
      responseModelSnapshot: "claude-sonnet-4-6-20251022",
      usage: {
        inputTokens: 10,
        outputTokens: 10,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      },
      latencyMs: 50,
      source: "eval",
      status: "ok",
    });

    expect(insertLlmCall).toHaveBeenCalledWith(
      expect.objectContaining({ source: "EVAL" }),
    );
  });
});
