import type { HubSpotClient } from "@/services/hubspot";

import {
  ENRICHMENT_INPUT_CONTACT_PROPERTY_NAMES,
  pickEnrichmentContactProperties,
} from "./enrichment-properties";
import { recordHubSpotWorkflowRunEnrichmentInputContext } from "./mutations";

export type ContactCreatedWorkflowEvent = {
  type: "contact.created";
  hubSpotObjectId: string;
  hubSpotPortalId?: string | null;
  occurredAt?: string | null;
};

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
    properties: [...ENRICHMENT_INPUT_CONTACT_PROPERTY_NAMES],
  });

  await recordHubSpotWorkflowRunEnrichmentInputContext(runId, {
    source: "hubspot_contact_created",
    hubSpotPortalId: workflowEvent.hubSpotPortalId ?? null,
    occurredAt: workflowEvent.occurredAt ?? null,
    contact: {
      id: contact.id,
      properties: pickEnrichmentContactProperties(contact.properties),
    },
  });
}
