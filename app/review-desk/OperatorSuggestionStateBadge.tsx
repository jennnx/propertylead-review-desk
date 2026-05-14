import {
  getOperatorSuggestionStateCopy,
  type HubSpotWritebackReviewState,
  type OperatorSuggestionTone,
} from "@/services/hubspot-writebacks";

const toneStyles: Record<
  OperatorSuggestionTone,
  { wrap: string; dot: string }
> = {
  approved: {
    wrap: "border-emerald-200/80 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  rejected: {
    wrap: "border-destructive/25 bg-destructive/10 text-destructive",
    dot: "bg-destructive",
  },
  awaiting: {
    wrap: "border-amber-200/80 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300",
    dot: "bg-amber-500",
  },
};

export function OperatorSuggestionStateBadge({
  state,
}: {
  state: HubSpotWritebackReviewState;
}) {
  const copy = getOperatorSuggestionStateCopy(state);
  const styles = toneStyles[copy.tone];

  return (
    <span
      data-suggestion-tone={copy.tone}
      className={`inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full border px-2 text-[10px] font-medium uppercase tracking-[0.08em] ${styles.wrap}`}
    >
      <span className={`size-1.5 rounded-full ${styles.dot}`} aria-hidden />
      {copy.label}
    </span>
  );
}
