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

const toneToClassName: Record<OperatorSuggestionTone, string> = {
  approved:
    "border-transparent bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  rejected: "",
  awaiting: "",
};

export function OperatorSuggestionStateBadge({
  state,
}: {
  state: HubSpotWritebackReviewState;
}) {
  const copy = getOperatorSuggestionStateCopy(state);

  return (
    <Badge
      variant={toneToBadgeVariant[copy.tone]}
      className={toneToClassName[copy.tone]}
      data-suggestion-tone={copy.tone}
    >
      {copy.label}
    </Badge>
  );
}
