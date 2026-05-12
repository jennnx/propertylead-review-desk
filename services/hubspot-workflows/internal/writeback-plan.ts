import { z } from "zod";

import { isWritableHubSpotPropertyName } from "@/services/hubspot";

const fieldUpdateSchema = z.object({
  name: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
});

const rawWritebackPlanSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("writeback"),
    fieldUpdates: z.array(fieldUpdateSchema).optional(),
    note: z.string().min(1).optional(),
  }),
  z
    .object({
      kind: z.literal("no_writeback"),
      reason: z.string().min(1),
      fieldUpdates: z.array(fieldUpdateSchema).optional(),
      note: z.string().optional(),
    })
    .passthrough(),
]);

export type HubSpotWritebackPlanFieldUpdate = {
  name: string;
  value: string | number | boolean | null;
};

export type HubSpotWritebackProposal = {
  kind: "writeback";
  fieldUpdates: HubSpotWritebackPlanFieldUpdate[];
  note: string | null;
};

export type HubSpotNoWritebackProposal = {
  kind: "no_writeback";
  reason: string;
};

export type HubSpotWritebackPlan =
  | HubSpotWritebackProposal
  | HubSpotNoWritebackProposal;

export type HubSpotWritebackPlanValidationResult =
  | { ok: true; plan: HubSpotWritebackPlan }
  | { ok: false; errors: string[] };

export function validateHubSpotWritebackPlan(
  raw: unknown,
): HubSpotWritebackPlanValidationResult {
  const parsed = rawWritebackPlanSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => issue.message),
    };
  }

  if (parsed.data.kind === "no_writeback") {
    const carriesWrites =
      (parsed.data.fieldUpdates && parsed.data.fieldUpdates.length > 0) ||
      (typeof parsed.data.note === "string" && parsed.data.note.length > 0);
    if (carriesWrites) {
      return {
        ok: false,
        errors: [
          "no_writeback plans must not carry proposed field updates or a note",
        ],
      };
    }
    return { ok: true, plan: { kind: "no_writeback", reason: parsed.data.reason } };
  }

  const fieldUpdates = parsed.data.fieldUpdates ?? [];
  const note = parsed.data.note ?? null;

  if (fieldUpdates.length === 0 && note === null) {
    return {
      ok: false,
      errors: [
        "writeback plans must include at least one field update or a note (empty plan)",
      ],
    };
  }

  const offendingNames = fieldUpdates
    .map((update) => update.name)
    .filter((name) => !isWritableHubSpotPropertyName(name));
  if (offendingNames.length > 0) {
    return {
      ok: false,
      errors: offendingNames.map(
        (name) =>
          `field "${name}" is not in the Writable HubSpot Property Catalog`,
      ),
    };
  }

  return {
    ok: true,
    plan: { kind: "writeback", fieldUpdates, note },
  };
}
