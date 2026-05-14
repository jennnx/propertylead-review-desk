import { hubSpot } from "@/services/hubspot";
import type { HubSpotWritebackProposal } from "@/services/hubspot-workflows";

import { executeHubSpotWritebackPlan } from "./executor";
import {
  createPendingHubSpotWriteback,
  markHubSpotWritebackAutoApplied,
} from "./mutations";
import {
  findHubSpotWritebackForApproval,
  getHubSpotWritebackAutoModeEnabled,
} from "./queries";

export type HandoffFinalizedHubSpotWritebackInput = {
  hubSpotWorkflowRunId: string;
  plan: HubSpotWritebackProposal;
};

export async function handoffFinalizedHubSpotWriteback(
  input: HandoffFinalizedHubSpotWritebackInput,
): Promise<void> {
  const created = await createPendingHubSpotWriteback({
    hubSpotWorkflowRunId: input.hubSpotWorkflowRunId,
    plan: input.plan,
  });

  const autoModeEnabled = await getHubSpotWritebackAutoModeEnabled();
  if (!autoModeEnabled) return;

  const writeback = await findHubSpotWritebackForApproval(created.id);
  if (!writeback || writeback.state !== "PENDING") {
    console.error("Auto-Mode could not find the pending HubSpot Writeback.", {
      hubSpotWorkflowRunId: input.hubSpotWorkflowRunId,
      hubSpotWritebackId: created.id,
    });
    return;
  }

  const execution = await executeHubSpotWritebackPlan({
    contactId: writeback.contactId,
    plan: writeback.plan,
    hubSpot,
  });

  if (!execution.ok) {
    console.error("Auto-Mode could not apply the HubSpot Writeback.", {
      hubSpotWorkflowRunId: input.hubSpotWorkflowRunId,
      hubSpotWritebackId: created.id,
      reason: execution.reason,
      message: execution.message,
    });
    return;
  }

  const markedAutoApplied = await markHubSpotWritebackAutoApplied({
    id: created.id,
    metadata: execution.metadata,
  });

  if (!markedAutoApplied) {
    console.error(
      "Auto-Mode applied HubSpot successfully, but the HubSpot Writeback was no longer pending.",
      {
        hubSpotWorkflowRunId: input.hubSpotWorkflowRunId,
        hubSpotWritebackId: created.id,
      },
    );
  }
}
