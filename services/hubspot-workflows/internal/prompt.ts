import {
  WRITABLE_HUBSPOT_PROPERTY_CATALOG,
  type WritableHubSpotPropertyCatalogEntry,
} from "@/services/hubspot";

import type { HubSpotWorkflowRunContactCreatedEnrichmentInputContext } from "./mutations";

export type HubSpotWritebackPlanToolSchema = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    [key: string]: unknown;
  };
};

export type HubSpotWritebackPlanPromptMaterial = {
  model: string;
  system: string;
  userMessage: string;
  tool: HubSpotWritebackPlanToolSchema;
};

export const HUBSPOT_WRITEBACK_PLAN_TOOL_NAME = "propose_writeback_plan";

export function buildContactCreatedWritebackPlanPrompt(input: {
  enrichmentInputContext: HubSpotWorkflowRunContactCreatedEnrichmentInputContext;
  model: string;
}): HubSpotWritebackPlanPromptMaterial {
  const catalogDescription = formatCatalogForPrompt(
    WRITABLE_HUBSPOT_PROPERTY_CATALOG,
  );

  const system = [
    "You are PropertyLead Review Desk's enrichment planner.",
    "You receive a current HubSpot contact and propose a HubSpot Writeback Plan.",
    "A writeback proposal contains at least one field update or a note (or both).",
    "Field updates must target only properties from the Writable HubSpot Property Catalog below.",
    "If there is nothing meaningful to enrich, return a no_writeback plan with a short reason.",
    "Never invent property names; never include both no_writeback and proposed writes.",
    "",
    "Writable HubSpot Property Catalog:",
    catalogDescription,
  ].join("\n");

  const userMessage = [
    "A new HubSpot contact was just created. Propose a HubSpot Writeback Plan.",
    "",
    "Current HubSpot contact:",
    "```json",
    JSON.stringify(input.enrichmentInputContext.contact, null, 2),
    "```",
  ].join("\n");

  const tool: HubSpotWritebackPlanToolSchema = {
    name: HUBSPOT_WRITEBACK_PLAN_TOOL_NAME,
    description:
      "Propose a HubSpot Writeback Plan for the current HubSpot contact.",
    input_schema: {
      type: "object",
      oneOf: [
        {
          type: "object",
          required: ["kind"],
          properties: {
            kind: { const: "writeback" },
            fieldUpdates: {
              type: "array",
              items: {
                type: "object",
                required: ["name", "value"],
                properties: {
                  name: { type: "string" },
                  value: {
                    anyOf: [
                      { type: "string" },
                      { type: "number" },
                      { type: "boolean" },
                      { type: "null" },
                    ],
                  },
                },
              },
            },
            note: { type: "string", minLength: 1 },
          },
        },
        {
          type: "object",
          required: ["kind", "reason"],
          properties: {
            kind: { const: "no_writeback" },
            reason: { type: "string", minLength: 1 },
          },
        },
      ],
    },
  };

  return {
    model: input.model,
    system,
    userMessage,
    tool,
  };
}

function formatCatalogForPrompt(
  catalog: readonly WritableHubSpotPropertyCatalogEntry[],
): string {
  return catalog
    .map((entry) => {
      const options = entry.options ? ` options=${entry.options.join("|")}` : "";
      return `- ${entry.name} (${entry.type}${options})`;
    })
    .join("\n");
}
