import {
  formatHubSpotNoteBodyForApi,
  isWritableHubSpotPropertyName,
  normalizeWritableHubSpotPropertyValue,
  type HubSpotClient,
} from "@/services/hubspot";
import type { HubSpotWritebackProposal } from "@/services/hubspot-workflows";

type HubSpotWritebackExecutorClient = Pick<
  HubSpotClient,
  "createContactNote" | "getContact" | "updateContactProperties"
>;

export type HubSpotWritebackExecutionMetadata = {
  fieldUpdates: {
    name: string;
    previousValue: string | null;
    proposedValue: string | number | boolean | null;
    result: "applied";
  }[];
  note: { id: string } | null;
};

export type HubSpotWritebackExecutionResult =
  | { ok: true; metadata: HubSpotWritebackExecutionMetadata }
  | {
      ok: false;
      reason: "invalid_plan" | "hubspot_error";
      message: string;
    };

export async function executeHubSpotWritebackPlan({
  contactId,
  plan,
  hubSpot,
}: {
  contactId: string;
  plan: HubSpotWritebackProposal;
  hubSpot: HubSpotWritebackExecutorClient;
}): Promise<HubSpotWritebackExecutionResult> {
  const outOfCatalogField = plan.fieldUpdates.find(
    (update) => !isWritableHubSpotPropertyName(update.name),
  );

  if (outOfCatalogField) {
    return {
      ok: false,
      reason: "invalid_plan",
      message: `field "${outOfCatalogField.name}" is not in the Writable HubSpot Property Catalog`,
    };
  }

  try {
    const fieldNames = plan.fieldUpdates.map((update) => update.name);
    const previousProperties =
      fieldNames.length > 0
        ? (
            await hubSpot.getContact(contactId, {
              properties: fieldNames,
            })
          ).properties
        : {};

    if (plan.fieldUpdates.length > 0) {
      await hubSpot.updateContactProperties(
        contactId,
        Object.fromEntries(
          plan.fieldUpdates.map((update) => [
            update.name,
            formatHubSpotPropertyValue(update.name, update.value),
          ]),
        ),
      );
    }

    const note =
      plan.note === null
        ? null
        : await hubSpot.createContactNote(contactId, {
            body: formatHubSpotNoteBodyForApi(plan.note),
          });

    return {
      ok: true,
      metadata: {
        fieldUpdates: plan.fieldUpdates.map((update) => ({
          name: update.name,
          previousValue: previousProperties[update.name] ?? null,
          proposedValue: update.value,
          result: "applied",
        })),
        note: note ? { id: note.id } : null,
      },
    };
  } catch (error) {
    return {
      ok: false,
      reason: "hubspot_error",
      message:
        error instanceof Error
          ? error.message
          : "HubSpot writeback request failed.",
    };
  }
}

function formatHubSpotPropertyValue(
  name: string,
  value: string | number | boolean | null,
): string | number | boolean {
  return normalizeWritableHubSpotPropertyValue(name, value) ?? "";
}
