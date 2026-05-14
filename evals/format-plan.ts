// Eval is a privileged consumer (see ../eslint.config.mjs evals/** override
// and ./README.md). Importing the catalog from its internal file rather than
// the @/services/hubspot barrel avoids dragging the HubSpot client + env
// validation into vitest's import-time chain — the formatter only needs the
// catalog labels.
import { getWritableHubSpotPropertyCatalogEntry } from "@/services/hubspot/internal/catalog";
import type { HubSpotWritebackPlanRequestResult } from "@/services/hubspot-workflows/internal/request-writeback-plan";

type AcceptedPlan = NonNullable<HubSpotWritebackPlanRequestResult["acceptedPlan"]>;

export function formatPlanForJudge(
  result: HubSpotWritebackPlanRequestResult,
): string {
  if (result.acceptedPlan === null) {
    return formatInvalidOutput(result);
  }
  return formatAcceptedPlan(result.acceptedPlan);
}

function formatAcceptedPlan(plan: AcceptedPlan): string {
  if (plan.kind === "no_writeback") {
    return [
      "Decision: no_writeback",
      `Reason: ${plan.reason}`,
      "",
      "Raw plan:",
      "```json",
      JSON.stringify(plan, null, 2),
      "```",
    ].join("\n");
  }

  const lines: string[] = ["Decision: writeback"];

  if (plan.fieldUpdates.length > 0) {
    lines.push("");
    lines.push("Field updates:");
    for (const update of plan.fieldUpdates) {
      const entry = getWritableHubSpotPropertyCatalogEntry(update.name);
      const label = entry?.label ?? update.name;
      lines.push(`- ${label} (${update.name}): ${formatFieldValue(update.value)}`);
    }
  } else {
    lines.push("");
    lines.push("Field updates: (none)");
  }

  if (plan.note !== null && plan.note.length > 0) {
    lines.push("");
    lines.push("Note (verbatim):");
    lines.push(plan.note);
  } else {
    lines.push("");
    lines.push("Note: (none)");
  }

  lines.push("");
  lines.push("Raw plan:");
  lines.push("```json");
  lines.push(JSON.stringify(plan, null, 2));
  lines.push("```");
  return lines.join("\n");
}

function formatInvalidOutput(result: HubSpotWritebackPlanRequestResult): string {
  const errors: string[] = [];
  for (const validation of result.validations) {
    if (!validation.ok) {
      errors.push(...validation.errors);
    }
  }
  const lines: string[] = [
    "Decision: invalid_output",
    "",
    "Validation errors:",
  ];
  if (errors.length === 0) {
    lines.push("- (no validation errors recorded)");
  } else {
    for (const error of errors) {
      lines.push(`- ${error}`);
    }
  }
  lines.push("");
  lines.push("Raw outputs:");
  lines.push("```json");
  lines.push(JSON.stringify(result.rawOutputs, null, 2));
  lines.push("```");
  return lines.join("\n");
}

function formatFieldValue(value: string | number | boolean | null): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  return String(value);
}
