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

function toolUseResponse(
  input: unknown,
  model = "claude-sonnet-4-6-20251022",
) {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model,
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

  test("uses an explicit Claude model override for inbound-message writeback plan requests", async () => {
    innerCreate.mockResolvedValueOnce(
      toolUseResponse(
        {
          kind: "writeback",
          fieldUpdates: [{ name: "pd_urgency", value: "high" }],
        },
        "claude-opus-4-7",
      ),
    );

    const { requestInboundMessageWritebackPlan } =
      await importWithRequiredEnv(() => import("./request-writeback-plan"));

    const result = await requestInboundMessageWritebackPlan({
      claudeModel: "claude-opus-4-7",
      enrichmentInputContext: {
        source: "hubspot_inbound_message",
        hubSpotPortalId: null,
        occurredAt: null,
        triggeringMessageId: "msg-1",
        contact: {
          id: "contact-123",
          properties: { email: "ana.lead@gmail.com" },
        },
        currentConversationSession: {
          messageLimit: 30,
          messages: [
            {
              id: "msg-1",
              threadId: "thread-1",
              actorId: null,
              direction: "INCOMING",
              text: "Can I tour this weekend?",
              richText: "<p>Can I tour this weekend?</p>",
              createdAt: "2026-05-12T15:00:00.000Z",
              truncationStatus: "NOT_TRUNCATED",
            },
          ],
        },
      },
    });

    expect(innerCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-opus-4-7" }),
      undefined,
    );
    expect(result.input.model).toBe("claude-opus-4-7");
    expect(recordLlmCall).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "anthropic",
        requestedModelAlias: "claude-opus-4-7",
        responseModelSnapshot: "claude-opus-4-7",
        status: "ok",
      }),
    );
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
