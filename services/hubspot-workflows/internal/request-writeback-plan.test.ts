// Validation-retry contract test (PRD #60 user story 15): when
// `requestWritebackPlan` retries because Claude's first output is invalid,
// the instrumented Claude wrapper must emit one telemetry row per attempt —
// two total. This test routes the real `claude` wrapper through a mocked
// Anthropic SDK so we exercise the wrapper instead of mocking it away.

import { beforeEach, describe, expect, test, vi } from "vitest";

import { importWithRequiredEnv } from "@/tests/env";

const innerCreate = vi.fn();
const recordLlmCall = vi.fn();

vi.mock("@/services/llm-telemetry", () => ({
  recordLlmCall,
}));

vi.mock("@anthropic-ai/sdk", () => {
  class MockAnthropic {
    apiKey: string;
    messages: { create: typeof innerCreate };
    constructor(options: { apiKey: string }) {
      this.apiKey = options.apiKey;
      this.messages = { create: innerCreate };
    }
  }
  return { default: MockAnthropic };
});

function toolUseResponse(input: unknown) {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-4-6-20251022",
    content: [
      {
        type: "tool_use",
        id: "toolu_test",
        name: "propose_writeback_plan",
        input,
      },
    ],
    stop_reason: "tool_use",
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  };
}

describe("requestWritebackPlan telemetry contract", () => {
  beforeEach(() => {
    innerCreate.mockReset();
    recordLlmCall.mockReset();
    recordLlmCall.mockResolvedValue(undefined);
  });

  test("emits one recordLlmCall per attempt — two on validation-retry", async () => {
    innerCreate
      .mockResolvedValueOnce(
        toolUseResponse({
          kind: "writeback",
          fieldUpdates: [{ name: "made_up_by_claude", value: "anything" }],
        }),
      )
      .mockResolvedValueOnce(
        toolUseResponse({
          kind: "writeback",
          fieldUpdates: [{ name: "pd_urgency", value: "high" }],
        }),
      );

    const { requestContactCreatedWritebackPlan } =
      await importWithRequiredEnv(() => import("./request-writeback-plan"));

    const result = await requestContactCreatedWritebackPlan({
      enrichmentInputContext: {
        source: "hubspot_contact_created",
        hubSpotPortalId: null,
        occurredAt: null,
        contact: {
          id: "contact-123",
          properties: { email: "ana.lead@gmail.com" },
        },
      },
    });

    expect(innerCreate).toHaveBeenCalledTimes(2);
    expect(recordLlmCall).toHaveBeenCalledTimes(2);
    expect(result.validations).toHaveLength(2);
    expect(result.validations[0]).toMatchObject({ ok: false });
    expect(result.validations[1]).toMatchObject({ ok: true });
    expect(result.acceptedPlan).toMatchObject({
      kind: "writeback",
      fieldUpdates: [{ name: "pd_urgency", value: "high" }],
    });
    for (const call of recordLlmCall.mock.calls) {
      expect(call[0]).toMatchObject({
        provider: "anthropic",
        requestedModelAlias: "claude-sonnet-4-6",
        responseModelSnapshot: "claude-sonnet-4-6-20251022",
        status: "ok",
        source: "production",
      });
    }
  });

  test("emits a recordLlmCall row even when the SDK throws a transport error", async () => {
    innerCreate
      .mockRejectedValueOnce(new Error("connect ECONNRESET"))
      .mockResolvedValueOnce(
        toolUseResponse({
          kind: "writeback",
          fieldUpdates: [{ name: "pd_urgency", value: "high" }],
        }),
      );

    const { requestContactCreatedWritebackPlan } =
      await importWithRequiredEnv(() => import("./request-writeback-plan"));

    const result = await requestContactCreatedWritebackPlan({
      enrichmentInputContext: {
        source: "hubspot_contact_created",
        hubSpotPortalId: null,
        occurredAt: null,
        contact: {
          id: "contact-123",
          properties: { email: "ana.lead@gmail.com" },
        },
      },
    });

    expect(recordLlmCall).toHaveBeenCalledTimes(2);
    const [first, second] = recordLlmCall.mock.calls.map((call) => call[0]);
    expect(first).toMatchObject({
      status: "error",
      errorMessage: "connect ECONNRESET",
    });
    expect(second).toMatchObject({ status: "ok" });
    expect(result.acceptedPlan).toBeTruthy();
  });
});
