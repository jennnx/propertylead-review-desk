import { claude, DEFAULT_CLAUDE_MODEL } from "@/services/claude";

import {
  buildContactCreatedWritebackPlanPrompt,
  buildInboundMessageWritebackPlanPrompt,
  HUBSPOT_WRITEBACK_PLAN_TOOL_NAME,
  type HubSpotWritebackPlanPromptMaterial,
} from "./prompt";
import type {
  HubSpotWorkflowRunContactCreatedEnrichmentInputContext,
  HubSpotWorkflowRunInboundMessageEnrichmentInputContext,
} from "./mutations";
import {
  validateHubSpotWritebackPlan,
  type HubSpotWritebackPlan,
} from "./writeback-plan";

const MAX_ATTEMPTS = 2;
const MAX_TOKENS = 1024;

export type HubSpotWritebackPlanValidationTrace =
  | { ok: true }
  | { ok: false; errors: string[] };

export type HubSpotWritebackPlanRequestResult = {
  input: HubSpotWritebackPlanPromptMaterial;
  rawOutputs: unknown[];
  validations: HubSpotWritebackPlanValidationTrace[];
  acceptedPlan: HubSpotWritebackPlan | null;
};

export async function requestContactCreatedWritebackPlan(input: {
  enrichmentInputContext: HubSpotWorkflowRunContactCreatedEnrichmentInputContext;
}): Promise<HubSpotWritebackPlanRequestResult> {
  const material = buildContactCreatedWritebackPlanPrompt({
    enrichmentInputContext: input.enrichmentInputContext,
    model: DEFAULT_CLAUDE_MODEL,
  });
  return requestWritebackPlan(material);
}

export async function requestInboundMessageWritebackPlan(input: {
  enrichmentInputContext: HubSpotWorkflowRunInboundMessageEnrichmentInputContext;
}): Promise<HubSpotWritebackPlanRequestResult> {
  const material = buildInboundMessageWritebackPlanPrompt({
    enrichmentInputContext: input.enrichmentInputContext,
    model: DEFAULT_CLAUDE_MODEL,
  });
  return requestWritebackPlan(material);
}

async function requestWritebackPlan(
  material: HubSpotWritebackPlanPromptMaterial,
): Promise<HubSpotWritebackPlanRequestResult> {
  const rawOutputs: unknown[] = [];
  const validations: HubSpotWritebackPlanValidationTrace[] = [];
  let acceptedPlan: HubSpotWritebackPlan | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let response: unknown;
    try {
      response = await claude.messages.create({
        model: material.model,
        max_tokens: MAX_TOKENS,
        system: material.system,
        tools: [material.tool],
        tool_choice: { type: "tool", name: HUBSPOT_WRITEBACK_PLAN_TOOL_NAME },
        messages: [{ role: "user", content: material.userMessage }],
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown Claude error";
      rawOutputs.push({ transportError: message });
      validations.push({
        ok: false,
        errors: [`claude transport error: ${message}`],
      });
      continue;
    }

    const raw = extractToolUseInput(response);
    rawOutputs.push(raw);

    const validation = validateHubSpotWritebackPlan(raw);
    if (validation.ok) {
      validations.push({ ok: true });
      acceptedPlan = validation.plan;
      break;
    }

    validations.push({ ok: false, errors: validation.errors });
  }

  return {
    input: material,
    rawOutputs,
    validations,
    acceptedPlan,
  };
}

function extractToolUseInput(response: unknown): unknown {
  const content =
    (response as { content?: unknown[] }).content ?? [];
  for (const block of content) {
    if (
      block &&
      typeof block === "object" &&
      (block as { type?: string }).type === "tool_use" &&
      (block as { name?: string }).name === HUBSPOT_WRITEBACK_PLAN_TOOL_NAME
    ) {
      return (block as { input?: unknown }).input ?? null;
    }
  }
  return null;
}
