import { z } from "zod";

import { isWritableHubSpotPropertyName } from "@/services/hubspot";

const fieldUpdateSchema = z.object({
  name: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
});

const writebackPlanSchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("writeback"),
      fieldUpdates: z.array(fieldUpdateSchema).optional(),
      note: z.string().min(1).optional(),
    }),
    z.looseObject({
      kind: z.literal("no_writeback"),
      reason: z.string().min(1),
      fieldUpdates: z.array(fieldUpdateSchema).optional(),
      note: z.string().optional(),
    }),
  ])
  .superRefine((plan, ctx) => {
    if (plan.kind === "no_writeback") {
      const carriesWrites =
        (plan.fieldUpdates && plan.fieldUpdates.length > 0) ||
        (typeof plan.note === "string" && plan.note.length > 0);
      if (carriesWrites) {
        ctx.addIssue({
          code: "custom",
          message:
            "no_writeback plans must not carry proposed field updates or a note",
        });
      }
      return;
    }

    const fieldUpdates = plan.fieldUpdates ?? [];
    const note = plan.note ?? null;

    if (fieldUpdates.length === 0 && note === null) {
      ctx.addIssue({
        code: "custom",
        message:
          "writeback plans must include at least one field update or a note (empty plan)",
      });
      return;
    }

    for (const update of fieldUpdates) {
      if (!isWritableHubSpotPropertyName(update.name)) {
        ctx.addIssue({
          code: "custom",
          message: `field "${update.name}" is not in the Writable HubSpot Property Catalog`,
        });
      }
    }
  })
  .transform((plan) => {
    if (plan.kind === "no_writeback") {
      return { kind: "no_writeback" as const, reason: plan.reason };
    }
    return {
      kind: "writeback" as const,
      fieldUpdates: plan.fieldUpdates ?? [],
      note: plan.note ?? null,
    };
  });

export type HubSpotWritebackPlanFieldUpdate = z.infer<typeof fieldUpdateSchema>;
export type HubSpotWritebackPlan = z.infer<typeof writebackPlanSchema>;
export type HubSpotWritebackProposal = Extract<
  HubSpotWritebackPlan,
  { kind: "writeback" }
>;
export type HubSpotNoWritebackProposal = Extract<
  HubSpotWritebackPlan,
  { kind: "no_writeback" }
>;

export type HubSpotWritebackPlanValidationResult =
  | { ok: true; plan: HubSpotWritebackPlan }
  | { ok: false; errors: string[] };

export function validateHubSpotWritebackPlan(
  raw: unknown,
): HubSpotWritebackPlanValidationResult {
  const result = writebackPlanSchema.safeParse(raw);
  if (result.success) {
    return { ok: true, plan: result.data };
  }
  return {
    ok: false,
    errors: result.error.issues.map((issue) => issue.message),
  };
}
