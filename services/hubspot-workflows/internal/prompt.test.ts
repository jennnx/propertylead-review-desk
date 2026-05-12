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
  });
});
