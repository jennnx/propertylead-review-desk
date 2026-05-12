import type { HubSpotClient } from "@/services/hubspot";

import {
  ENRICHMENT_INPUT_CONTACT_PROPERTY_NAMES,
  pickEnrichmentContactProperties,
} from "./enrichment-properties";
import {
  recordHubSpotWorkflowRunEnrichmentInputContext,
  recordHubSpotWorkflowRunWritebackPlanTrace,
  type HubSpotWorkflowRunContactCreatedEnrichmentInputContext,
} from "./mutations";
import { requestContactCreatedWritebackPlan } from "./request-writeback-plan";
import type { HubSpotWritebackPlan } from "./writeback-plan";

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
}): Promise<{ plan: HubSpotWritebackPlan }> {
  const contact = await hubSpot.getContact(workflowEvent.hubSpotObjectId, {
    properties: [...ENRICHMENT_INPUT_CONTACT_PROPERTY_NAMES],
  });

  const enrichmentInputContext: HubSpotWorkflowRunContactCreatedEnrichmentInputContext =
    {
      source: "hubspot_contact_created",
      hubSpotPortalId: workflowEvent.hubSpotPortalId ?? null,
      occurredAt: workflowEvent.occurredAt ?? null,
      contact: {
        id: contact.id,
        properties: pickEnrichmentContactProperties(contact.properties),
      },
    };

  await recordHubSpotWorkflowRunEnrichmentInputContext(
    runId,
    enrichmentInputContext,
  );

  const planResult = await requestContactCreatedWritebackPlan({
    enrichmentInputContext,
  });

  await recordHubSpotWorkflowRunWritebackPlanTrace(runId, {
    input: planResult.input,
    rawOutputs: planResult.rawOutputs,
    validations: planResult.validations,
    acceptedPlan: planResult.acceptedPlan,
  });

  if (!planResult.acceptedPlan) {
    throw new Error(
      `Failed to obtain a valid HubSpot Writeback Plan after ${planResult.rawOutputs.length} attempt(s)`,
    );
  }

  return { plan: planResult.acceptedPlan };
}
