import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  HubSpotWorkflowRunConversationMessage,
  HubSpotWorkflowRunInboundMessageEnrichmentInputContext,
} from "@/services/hubspot-workflows/internal/mutations";
import {
  requestInboundMessageWritebackPlan,
  type HubSpotWritebackPlanRequestResult,
} from "@/services/hubspot-workflows/internal/request-writeback-plan";

import type { EvalCase } from "./cases";
import { evaluateCase } from "./provider";

vi.mock("@/services/hubspot-workflows/internal/request-writeback-plan", () => ({
  requestInboundMessageWritebackPlan: vi.fn(),
  requestContactCreatedWritebackPlan: vi.fn(),
}));

const mockedRequest = vi.mocked(requestInboundMessageWritebackPlan);

const stubResult: HubSpotWritebackPlanRequestResult = {
  input: {
    model: "claude-sonnet-4-6",
    system: "",
    userMessage: "",
    tool: {
      name: "propose_writeback_plan",
      description: "",
      input_schema: { type: "object" },
    },
  },
  rawOutputs: [{}],
  validations: [{ ok: true }],
  acceptedPlan: {
    kind: "writeback",
    fieldUpdates: [{ name: "pd_urgency", value: "high" }],
    note: "Suggested next action: confirm tour.",
  },
};

describe("evaluateCase for inbound.message cases", () => {
  beforeEach(() => {
    mockedRequest.mockReset();
    mockedRequest.mockResolvedValue(stubResult);
  });

  it("passes an Enrichment Input Context whose shape matches the production HubSpotWorkflowRunInboundMessageEnrichmentInputContext", async () => {
    const evalCase: EvalCase = {
      name: "shape-contract-test",
      rubric: "PASS",
      trigger: {
        kind: "inbound.message",
        context: {
          source: "hubspot_inbound_message",
          hubSpotPortalId: "PORTAL_X",
          occurredAt: "2026-05-12T14:00:00Z",
          triggeringMessageId: "msg-1",
          contact: {
            id: "contact-1",
            properties: {
              email: "casey.morales@gmail.com",
              firstname: "Casey",
              lastname: "Morales",
            },
          },
          currentConversationSession: {
            messages: [
              {
                id: "msg-1",
                text: "Hey & welcome — interested in 22 Birch Lane <fingers crossed>",
              },
            ],
          },
        },
      },
    };

    const result = await evaluateCase(evalCase);

    expect(mockedRequest).toHaveBeenCalledOnce();
    const passedContext: HubSpotWorkflowRunInboundMessageEnrichmentInputContext =
      mockedRequest.mock.calls[0][0].enrichmentInputContext;

    expect(passedContext.source).toBe("hubspot_inbound_message");
    expect(passedContext.hubSpotPortalId).toBe("PORTAL_X");
    expect(passedContext.occurredAt).toBe("2026-05-12T14:00:00Z");
    expect(passedContext.triggeringMessageId).toBe("msg-1");
    expect(passedContext.contact.id).toBe("contact-1");
    expect(passedContext.contact.properties.email).toBe(
      "casey.morales@gmail.com",
    );
    expect(passedContext.currentConversationSession.messageLimit).toBe(30);

    expect(passedContext.currentConversationSession.messages).toHaveLength(1);
    const message: HubSpotWorkflowRunConversationMessage =
      passedContext.currentConversationSession.messages[0];
    expect(message.id).toBe("msg-1");
    expect(message.text).toBe(
      "Hey & welcome — interested in 22 Birch Lane <fingers crossed>",
    );
    expect(message.threadId).toBe("eval-thread");
    expect(message.actorId).toBeNull();
    expect(message.direction).toBeNull();
    expect(message.createdAt).toBeNull();
    expect(message.truncationStatus).toBe("NOT_TRUNCATED");
    expect(message.richText).toBe(
      "Hey &amp; welcome — interested in 22 Birch Lane &lt;fingers crossed&gt;",
    );

    expect(result.vars.triggerSummary).toContain("Casey Morales");
    expect(result.vars.triggerSummary).toContain("casey.morales@gmail.com");
    expect(result.vars.triggerSummary).toContain("22 Birch Lane");
    expect(result.output).toContain("Decision: writeback");
  });

  it("preserves an explicitly provided message limit and richText override", async () => {
    const evalCase: EvalCase = {
      name: "explicit-defaults-test",
      rubric: "PASS",
      trigger: {
        kind: "inbound.message",
        context: {
          source: "hubspot_inbound_message",
          hubSpotPortalId: null,
          occurredAt: null,
          triggeringMessageId: "msg-9",
          contact: { id: "c-9", properties: {} },
          currentConversationSession: {
            messageLimit: 10,
            messages: [
              {
                id: "msg-9",
                text: "raw text",
                richText: "<p>raw text</p>",
                truncationStatus: "TRUNCATED",
                threadId: "thread-9",
                actorId: "actor-9",
                direction: "OUTGOING",
                createdAt: "2026-05-12T15:00:00Z",
              },
            ],
          },
        },
      },
    };

    await evaluateCase(evalCase);

    const passedContext =
      mockedRequest.mock.calls[0][0].enrichmentInputContext;
    expect(passedContext.currentConversationSession.messageLimit).toBe(10);
    expect(passedContext.currentConversationSession.messages[0]).toEqual({
      id: "msg-9",
      threadId: "thread-9",
      actorId: "actor-9",
      direction: "OUTGOING",
      text: "raw text",
      richText: "<p>raw text</p>",
      createdAt: "2026-05-12T15:00:00Z",
      truncationStatus: "TRUNCATED",
    });
  });
});
