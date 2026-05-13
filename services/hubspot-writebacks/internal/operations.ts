import type { HubSpotWritebackProposal } from "../../hubspot-workflows";

import { createPendingHubSpotWriteback } from "./mutations";

export type RecordProposedHubSpotWritebackInput = {
  hubSpotWorkflowRunId: string;
  plan: HubSpotWritebackProposal;
};

export async function recordProposedHubSpotWriteback(
  input: RecordProposedHubSpotWritebackInput,
): Promise<void> {
  await createPendingHubSpotWriteback({
    hubSpotWorkflowRunId: input.hubSpotWorkflowRunId,
    plan: input.plan,
  });
}
