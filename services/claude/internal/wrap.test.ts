import { beforeEach, describe, expect, test, vi } from "vitest";

import { importWithRequiredEnv } from "@/tests/env";

const recordLlmCall = vi.fn();

vi.mock("@/services/llm-telemetry", () => ({
  recordLlmCall,
}));

describe("Instrumented Claude wrapper", () => {
  beforeEach(() => {
    recordLlmCall.mockReset();
    recordLlmCall.mockResolvedValue(undefined);
  });

  test("records a telemetry row on a successful messages.create call", async () => {
    const innerCreate = vi.fn().mockResolvedValue({
      id: "msg_01",
      model: "claude-sonnet-4-6-20251022",
      usage: {
        input_tokens: 120,
        output_tokens: 40,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
      content: [],
    });
    const inner = { apiKey: "test-key", messages: { create: innerCreate } };

    const { createInstrumentedClaude } = await importWithRequiredEnv(() =>
      import("./wrap"),
    );
    const claude = createInstrumentedClaude(
      inner as unknown as Parameters<typeof createInstrumentedClaude>[0],
    );

    const response = await claude.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 256,
      messages: [{ role: "user", content: "hi" }],
    });

    expect(response).toMatchObject({ id: "msg_01" });
    expect(innerCreate).toHaveBeenCalledTimes(1);
    expect(recordLlmCall).toHaveBeenCalledTimes(1);
    const event = recordLlmCall.mock.calls[0][0];
    expect(event).toMatchObject({
      provider: "anthropic",
      requestedModelAlias: "claude-sonnet-4-6",
      responseModelSnapshot: "claude-sonnet-4-6-20251022",
      usage: {
        inputTokens: 120,
        outputTokens: 40,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      },
      source: "production",
      status: "ok",
    });
    expect(typeof event.latencyMs).toBe("number");
  });

  test("records a telemetry row on an SDK transport error and rethrows", async () => {
    const innerCreate = vi
      .fn()
      .mockRejectedValue(new Error("Anthropic API connection refused"));
    const inner = { apiKey: "test-key", messages: { create: innerCreate } };

    const { createInstrumentedClaude } = await importWithRequiredEnv(() =>
      import("./wrap"),
    );
    const claude = createInstrumentedClaude(
      inner as unknown as Parameters<typeof createInstrumentedClaude>[0],
    );

    await expect(
      claude.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 256,
        messages: [{ role: "user", content: "hi" }],
      }),
    ).rejects.toThrow("Anthropic API connection refused");

    expect(recordLlmCall).toHaveBeenCalledTimes(1);
    expect(recordLlmCall).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "anthropic",
        requestedModelAlias: "claude-sonnet-4-6",
        status: "error",
        errorMessage: "Anthropic API connection refused",
      }),
    );
  });

  test("tags telemetry events with LLM_TELEMETRY_SOURCE=eval when configured", async () => {
    const innerCreate = vi.fn().mockResolvedValue({
      id: "msg_eval_01",
      model: "claude-sonnet-4-6-20251022",
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
      content: [],
    });
    const inner = { apiKey: "test-key", messages: { create: innerCreate } };

    const { createInstrumentedClaude } = await importWithRequiredEnv(
      () => import("./wrap"),
      { LLM_TELEMETRY_SOURCE: "eval" },
    );
    const claude = createInstrumentedClaude(
      inner as unknown as Parameters<typeof createInstrumentedClaude>[0],
    );

    await claude.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 256,
      messages: [{ role: "user", content: "eval-run-1" }],
    });

    expect(recordLlmCall).toHaveBeenCalledWith(
      expect.objectContaining({ source: "eval" }),
    );
  });

  test("attaches async telemetry context to successful and failed calls", async () => {
    const innerCreate = vi
      .fn()
      .mockResolvedValueOnce({
        id: "msg_context_01",
        model: "claude-sonnet-4-6-20251022",
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
        content: [],
      })
      .mockRejectedValueOnce(new Error("provider timeout"));
    const inner = { apiKey: "test-key", messages: { create: innerCreate } };

    const { createInstrumentedClaude, runWithClaudeTelemetryContext } =
      await importWithRequiredEnv(() => import("./wrap"));
    const claude = createInstrumentedClaude(
      inner as unknown as Parameters<typeof createInstrumentedClaude>[0],
    );

    await runWithClaudeTelemetryContext(
      { hubSpotWorkflowRunId: "workflow-run-1" },
      () =>
        claude.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 256,
          messages: [{ role: "user", content: "hi" }],
        }),
    );
    await expect(
      runWithClaudeTelemetryContext(
        { hubSpotWorkflowRunId: "workflow-run-1" },
        () =>
          claude.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 256,
            messages: [{ role: "user", content: "hi again" }],
          }),
      ),
    ).rejects.toThrow("provider timeout");

    expect(recordLlmCall).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        context: { hubSpotWorkflowRunId: "workflow-run-1" },
        status: "ok",
      }),
    );
    expect(recordLlmCall).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        context: { hubSpotWorkflowRunId: "workflow-run-1" },
        status: "error",
      }),
    );
  });

  test("does not surface telemetry write failures to the caller", async () => {
    const innerCreate = vi.fn().mockResolvedValue({
      id: "msg_01",
      model: "claude-sonnet-4-6-20251022",
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
      content: [],
    });
    const inner = { apiKey: "test-key", messages: { create: innerCreate } };
    recordLlmCall.mockRejectedValueOnce(new Error("telemetry DB down"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { createInstrumentedClaude } = await importWithRequiredEnv(() =>
      import("./wrap"),
    );
    const claude = createInstrumentedClaude(
      inner as unknown as Parameters<typeof createInstrumentedClaude>[0],
    );

    const response = await claude.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 256,
      messages: [{ role: "user", content: "hi" }],
    });

    expect(response).toMatchObject({ id: "msg_01" });
    expect(warnSpy).toHaveBeenCalled();
  });
});
