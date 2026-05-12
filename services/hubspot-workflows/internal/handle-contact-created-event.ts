import {
  WRITABLE_HUBSPOT_PROPERTY_CATALOG,
  type HubSpotClient,
} from "@/services/hubspot";

import { recordHubSpotWorkflowRunEnrichmentInputContext } from "./mutations";

export type ContactCreatedWorkflowEvent = {
  type: "contact.created";
  hubSpotObjectId: string;
  hubSpotPortalId?: string | null;
  occurredAt?: string | null;
};

const contactCreatedEnrichmentPropertyNames = [
  ...WRITABLE_HUBSPOT_PROPERTY_CATALOG.map((entry) => entry.name),
  "hs_analytics_source_data_1",
  "hs_analytics_source_data_2",
  "hs_latest_source_data_1",
  "hs_latest_source_data_2",
];

export async function handleContactCreatedWorkflowEvent({
  runId,
  workflowEvent,
  hubSpot,
}: {
  runId: string;
  workflowEvent: ContactCreatedWorkflowEvent;
  hubSpot: Pick<HubSpotClient, "getContact">;
}): Promise<void> {
  const contact = await hubSpot.getContact(workflowEvent.hubSpotObjectId, {
    properties: contactCreatedEnrichmentPropertyNames,
  });

  await recordHubSpotWorkflowRunEnrichmentInputContext(runId, {
    source: "hubspot_contact_created",
    hubSpotPortalId: workflowEvent.hubSpotPortalId ?? null,
    occurredAt: workflowEvent.occurredAt ?? null,
    contact: {
      id: contact.id,
      properties: pickContactProperties(
        contact.properties,
        contactCreatedEnrichmentPropertyNames,
      ),
    },
  });
}

function pickContactProperties(
  properties: Record<string, string | null>,
  allowedNames: readonly string[],
): Record<string, string | null> {
  const picked: Record<string, string | null> = {};

  for (const name of allowedNames) {
    picked[name] = properties[name] ?? null;
  }

  return picked;
}
