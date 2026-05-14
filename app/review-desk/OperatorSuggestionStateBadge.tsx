import { Badge } from "@/components/ui/badge";
import {
  getOperatorSuggestionStateCopy,
  type HubSpotWritebackReviewState,
  type OperatorSuggestionTone,
} from "@/services/hubspot-writebacks";

const toneToBadgeVariant: Record<
  OperatorSuggestionTone,
  "default" | "destructive" | "outline"
> = {
  approved: "default",
  rejected: "destructive",
  awaiting: "outline",
};

export function OperatorSuggestionStateBadge({
  state,
}: {
  state: HubSpotWritebackReviewState;
}) {
  const copy = getOperatorSuggestionStateCopy(state);

  return (
    <Badge variant={toneToBadgeVariant[copy.tone]} data-suggestion-tone={copy.tone}>
      {copy.label}
    </Badge>
  );
}
