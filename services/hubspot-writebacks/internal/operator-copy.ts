import type { HubSpotWritebackReviewState } from "./queries";

export type OperatorSuggestionTone = "approved" | "rejected" | "awaiting";

export type OperatorSuggestionStateCopy = {
  label: string;
  tone: OperatorSuggestionTone;
};

export function getOperatorSuggestionStateCopy(
  state: HubSpotWritebackReviewState,
): OperatorSuggestionStateCopy {
  switch (state) {
    case "APPLIED":
      return { label: "approved", tone: "approved" };
    case "AUTO_APPLIED":
      return { label: "auto-approved", tone: "approved" };
    case "REJECTED":
      return { label: "rejected", tone: "rejected" };
    case "PENDING":
      return { label: "awaiting review", tone: "awaiting" };
  }
}

export type OperatorRecommendationPlan = {
  fieldUpdates: ReadonlyArray<unknown>;
  note: string | null;
};

export function getOperatorRecommendationSummary(
  plan: OperatorRecommendationPlan,
): string {
  const updateCount = plan.fieldUpdates.length;
  if (updateCount > 0 && plan.note) {
    return `The AI recommends ${formatUpdateCount(updateCount)} and adding a HubSpot note.`;
  }
  if (updateCount > 0) {
    return `The AI recommends ${formatUpdateCount(updateCount)}.`;
  }
  return "The AI recommends adding a HubSpot note.";
}

function formatUpdateCount(count: number): string {
  return count === 1
    ? "updating 1 HubSpot field"
    : `updating ${count} HubSpot fields`;
}
