import { z } from "zod";

import {
  WRITABLE_HUBSPOT_PROPERTY_CATALOG,
  type WritableHubSpotPropertyCatalogEntry,
} from "@/services/hubspot";
import { getPrismaClient } from "@/services/database";

const fieldUpdateSchema = z.object({
  name: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
});

const writebackProposalSchema = z.object({
  kind: z.literal("writeback"),
  fieldUpdates: z.array(fieldUpdateSchema),
  note: z.string().nullable(),
});

const normalizedWebhookEventSchema = z
  .discriminatedUnion("type", [
    z.object({
      type: z.literal("contact.created"),
      hubSpotObjectId: z.string(),
      hubSpotPortalId: z.string().nullable(),
      occurredAt: z.string().nullable(),
    }),
    z.object({
      type: z.literal("conversation.message.received"),
      hubSpotObjectId: z.string(),
      hubSpotPortalId: z.string().nullable(),
      occurredAt: z.string().nullable(),
      hubSpotMessageId: z.string(),
    }),
  ])
  .catch({
    type: "contact.created",
    hubSpotObjectId: "unknown",
    hubSpotPortalId: null,
    occurredAt: null,
  });

const enrichmentInputContextSchema = z
  .object({
    source: z.string(),
    occurredAt: z.string().nullable().optional(),
    contact: z.object({
      id: z.string().min(1),
      properties: z.record(z.string(), z.unknown()).catch({}),
    }),
    currentConversationSession: z
      .object({
        messages: z.array(z.unknown()).catch([]),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const approvalRowSchema = z.object({
  id: z.string(),
  state: z.enum(["PENDING", "APPLIED", "AUTO_APPLIED", "REJECTED"]),
  plan: writebackProposalSchema,
  hubSpotWorkflowRun: z.object({
    enrichmentInputContext: z
      .object({
        contact: z.object({
          id: z.string().min(1),
        }),
      })
      .passthrough(),
  }),
});

const reviewRowSchema = z.object({
  id: z.string(),
  state: z.enum(["PENDING", "APPLIED", "AUTO_APPLIED", "REJECTED"]),
  plan: writebackProposalSchema,
  reviewDeskFeedbackNote: z.string().nullable(),
  appliedAt: z.date().nullable(),
  createdAt: z.date(),
  hubSpotWorkflowRun: z.object({
    enrichmentInputContext: enrichmentInputContextSchema,
    writebackPlanRawOutputs: z.unknown().nullable(),
    hubSpotWebhookEvent: z.object({
      normalizedEvent: normalizedWebhookEventSchema,
    }),
  }),
});

export type HubSpotWritebackForApproval = z.infer<
  typeof approvalRowSchema
> & {
  contactId: string;
};

export type HubSpotWritebackReviewState = z.infer<
  typeof reviewRowSchema
>["state"];

export type HubSpotWritebackPlanFieldUpdateView = {
  name: string;
  label: string;
  value: string | number | boolean | null;
};

export type HubSpotWritebackReviewItem = {
  id: string;
  state: HubSpotWritebackReviewState;
  createdAt: Date;
  triggerSummary: string;
  contactName: string;
  contactEmail: string | null;
  recommendationSummary: string;
};

export type HubSpotWritebackReviewDetail = HubSpotWritebackReviewItem & {
  appliedAt: Date | null;
  reviewDeskFeedbackNote: string | null;
  plan: {
    fieldUpdates: HubSpotWritebackPlanFieldUpdateView[];
    note: string | null;
  };
  claudeReasoning: string;
  enrichmentInputContext: unknown;
};

const HUBSPOT_WRITEBACK_SETTINGS_ID = "global";

export async function getHubSpotWritebackAutoModeEnabled(): Promise<boolean> {
  const row = await getPrismaClient().hubSpotWritebackSettings.findUnique({
    where: { id: HUBSPOT_WRITEBACK_SETTINGS_ID },
    select: { autoModeEnabled: true },
  });

  return row?.autoModeEnabled ?? false;
}

export async function findHubSpotWritebackForApproval(
  id: string,
): Promise<HubSpotWritebackForApproval | null> {
  const row = await getPrismaClient().hubSpotWriteback.findUnique({
    where: { id },
    select: {
      id: true,
      state: true,
      plan: true,
      hubSpotWorkflowRun: {
        select: {
          enrichmentInputContext: true,
        },
      },
    },
  });

  if (!row) return null;

  const parsed = approvalRowSchema.parse(row);
  return {
    ...parsed,
    contactId: parsed.hubSpotWorkflowRun.enrichmentInputContext.contact.id,
  };
}

export async function listPendingHubSpotWritebackReviewItems(): Promise<
  HubSpotWritebackReviewItem[]
> {
  const rows = await getPrismaClient().hubSpotWriteback.findMany({
    where: { state: "PENDING" },
    orderBy: { createdAt: "asc" },
    select: reviewRowSelect,
  });

  return rows.map((row) => toReviewDetail(reviewRowSchema.parse(row)));
}

export async function findHubSpotWritebackReviewDetail(
  id: string,
): Promise<HubSpotWritebackReviewDetail | null> {
  const row = await getPrismaClient().hubSpotWriteback.findUnique({
    where: { id },
    select: reviewRowSelect,
  });

  if (!row) return null;
  return toReviewDetail(reviewRowSchema.parse(row));
}

const reviewRowSelect = {
  id: true,
  state: true,
  plan: true,
  reviewDeskFeedbackNote: true,
  appliedAt: true,
  createdAt: true,
  hubSpotWorkflowRun: {
    select: {
      enrichmentInputContext: true,
      writebackPlanRawOutputs: true,
      hubSpotWebhookEvent: {
        select: {
          normalizedEvent: true,
        },
      },
    },
  },
} as const;

const catalogLabels = new Map(
  WRITABLE_HUBSPOT_PROPERTY_CATALOG.map(
    (entry: WritableHubSpotPropertyCatalogEntry) => [entry.name, entry.label],
  ),
);

function toReviewDetail(
  row: z.infer<typeof reviewRowSchema>,
): HubSpotWritebackReviewDetail {
  const contactProperties = row.hubSpotWorkflowRun.enrichmentInputContext.contact
    .properties;
  const contactName = formatContactName(contactProperties);
  const contactEmail = readNullableString(contactProperties.email);
  const fieldUpdates = row.plan.fieldUpdates.map((update) => ({
    name: update.name,
    label: catalogLabels.get(update.name) ?? update.name,
    value: update.value,
  }));

  return {
    id: row.id,
    state: row.state,
    createdAt: row.createdAt,
    appliedAt: row.appliedAt,
    reviewDeskFeedbackNote: row.reviewDeskFeedbackNote,
    triggerSummary: formatTriggerSummary({
      event: row.hubSpotWorkflowRun.hubSpotWebhookEvent.normalizedEvent,
      contactName,
    }),
    contactName,
    contactEmail,
    recommendationSummary: formatRecommendationSummary(fieldUpdates, row.plan.note),
    plan: {
      fieldUpdates,
      note: row.plan.note,
    },
    claudeReasoning: formatClaudeReasoning(
      row.hubSpotWorkflowRun.writebackPlanRawOutputs,
    ),
    enrichmentInputContext:
      row.hubSpotWorkflowRun.enrichmentInputContext as unknown,
  };
}

function formatContactName(properties: Record<string, unknown>): string {
  const parts = [
    readNullableString(properties.firstname),
    readNullableString(properties.lastname),
  ].filter((part): part is string => part !== null);
  return parts.join(" ") || readNullableString(properties.email) || "Unknown contact";
}

function formatTriggerSummary({
  event,
  contactName,
}: {
  event: z.infer<typeof normalizedWebhookEventSchema>;
  contactName: string;
}): string {
  if (event.type === "conversation.message.received") {
    return `Inbound message from ${contactName}`;
  }
  return `New contact created: ${contactName}`;
}

function formatRecommendationSummary(
  fieldUpdates: HubSpotWritebackPlanFieldUpdateView[],
  note: string | null,
): string {
  const updateCount = fieldUpdates.length;
  if (updateCount > 0 && note) {
    return `Claude recommends ${formatUpdateCount(updateCount)} and adding a HubSpot note.`;
  }
  if (updateCount > 0) {
    return `Claude recommends ${formatUpdateCount(updateCount)}.`;
  }
  return "Claude recommends adding a HubSpot note.";
}

function formatUpdateCount(count: number): string {
  return count === 1 ? "updating 1 HubSpot field" : `updating ${count} HubSpot fields`;
}

function formatClaudeReasoning(rawOutputs: unknown): string {
  const latest = Array.isArray(rawOutputs) ? rawOutputs.at(-1) : rawOutputs;
  if (latest && typeof latest === "object" && "reasoning" in latest) {
    const reasoning = (latest as { reasoning?: unknown }).reasoning;
    if (typeof reasoning === "string" && reasoning.length > 0) {
      return reasoning;
    }
  }
  return "Claude returned a structured HubSpot Writeback Plan without a separate reasoning field.";
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
