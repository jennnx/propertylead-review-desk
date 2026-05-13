// Per ADR 0012: focused internal test of a pure prompt-builder transform whose
// catalog/tool-schema contract the barrel test cannot reach without contortion.

import { describe, expect, test } from "vitest";

import { importWithRequiredEnv } from "@/tests/env";

describe("HubSpot Writeback Plan prompt material", () => {
  test("includes representative Writable HubSpot Property Catalog entries in the system prompt", async () => {
    const { buildContactCreatedWritebackPlanPrompt } =
      await importWithRequiredEnv(() => import("./prompt"));

    const material = buildContactCreatedWritebackPlanPrompt({
      enrichmentInputContext: {
        source: "hubspot_contact_created",
        hubSpotPortalId: null,
        occurredAt: null,
        contact: { id: "123", properties: { email: "ada@example.com" } },
      },
      model: "claude-sonnet-4-6",
    });

    expect(material.system).toMatch(/pd_urgency/);
    expect(material.system).toMatch(/pd_primary_intent/);
    expect(material.system).toMatch(/email/);
    expect(material.system).toMatch(/How quickly the agent should respond/);
    expect(material.system).toMatch(/allowed values=.*request_showing/);
    expect(material.system).toMatch(
      /pd_last_enriched_at:.*CONTEXT ONLY - do not return this field/,
    );
    expect(material.system).toMatch(
      /hs_analytics_source:.*CONTEXT ONLY - do not return this field/,
    );
  });

  test("frames Claude's job around real estate agent triage and brief notes", async () => {
    const { buildContactCreatedWritebackPlanPrompt } =
      await importWithRequiredEnv(() => import("./prompt"));

    const material = buildContactCreatedWritebackPlanPrompt({
      enrichmentInputContext: {
        source: "hubspot_contact_created",
        hubSpotPortalId: null,
        occurredAt: null,
        contact: { id: "123", properties: {} },
      },
      model: "claude-sonnet-4-6",
    });

    expect(material.system).toMatch(/real estate agent triage/);
    expect(material.system).toMatch(/two equally important questions/);
    expect(material.system).toMatch(/field updates only, a note only, both/);
    expect(material.system).toMatch(/The goal is to be helpful, not noisy/);
    expect(material.system).toMatch(/Keep it brief/);
    expect(material.system).toMatch(/Do not write a long essay/);
    expect(material.system).not.toMatch(/HubSpot Writeback Plan/);
  });

  test("declares a tool with the agreed name and a two-branch oneOf input schema", async () => {
    const {
      buildContactCreatedWritebackPlanPrompt,
      HUBSPOT_WRITEBACK_PLAN_TOOL_NAME,
    } = await importWithRequiredEnv(() => import("./prompt"));

    const material = buildContactCreatedWritebackPlanPrompt({
      enrichmentInputContext: {
        source: "hubspot_contact_created",
        hubSpotPortalId: null,
        occurredAt: null,
        contact: { id: "123", properties: {} },
      },
      model: "claude-sonnet-4-6",
    });

    expect(material.tool.name).toBe(HUBSPOT_WRITEBACK_PLAN_TOOL_NAME);
    const schema = material.tool.input_schema as unknown as {
      oneOf: { properties: { kind: { const: string } } }[];
    };
    expect(schema.oneOf.map((branch) => branch.properties.kind.const).sort()).toEqual(
      ["no_writeback", "writeback"],
    );
  });

  test("places the current HubSpot contact JSON into the user message", async () => {
    const { buildContactCreatedWritebackPlanPrompt } =
      await importWithRequiredEnv(() => import("./prompt"));

    const material = buildContactCreatedWritebackPlanPrompt({
      enrichmentInputContext: {
        source: "hubspot_contact_created",
        hubSpotPortalId: null,
        occurredAt: null,
        contact: {
          id: "contact-7",
          properties: { email: "ada@example.com", pd_urgency: "high" },
        },
      },
      model: "claude-sonnet-4-6",
    });

    expect(material.userMessage).toMatch(/contact-7/);
    expect(material.userMessage).toMatch(/ada@example.com/);
    expect(material.userMessage).toMatch(/pd_urgency/);
    expect(material.userMessage).toMatch(/new HubSpot contact was just created/);
    expect(material.userMessage).not.toMatch(/HubSpot Writeback Plan/);
  });

  test("places inbound-message context and deterministic event text into the user message", async () => {
    const { buildInboundMessageWritebackPlanPrompt } =
      await importWithRequiredEnv(() => import("./prompt"));

    const material = buildInboundMessageWritebackPlanPrompt({
      enrichmentInputContext: {
        source: "hubspot_inbound_message",
        hubSpotPortalId: null,
        occurredAt: null,
        triggeringMessageId: "msg-123",
        contact: {
          id: "contact-7",
          properties: { email: "ada@example.com" },
        },
        currentConversationSession: {
          messageLimit: 30,
          messages: [
            {
              id: "msg-123",
              threadId: "thread-1",
              actorId: "actor-1",
              direction: "INCOMING",
              text: "Can I tour this weekend?",
              richText: null,
              createdAt: "2026-05-13T16:12:00.000Z",
              truncationStatus: "NOT_TRUNCATED",
            },
          ],
        },
      },
      model: "claude-sonnet-4-6",
    });

    expect(material.userMessage).toMatch(/inbound HubSpot Conversations message/);
    expect(material.userMessage).toMatch(/msg-123/);
    expect(material.userMessage).toMatch(/Can I tour this weekend/);
    expect(material.userMessage).not.toMatch(/HubSpot Writeback Plan/);
  });
});
