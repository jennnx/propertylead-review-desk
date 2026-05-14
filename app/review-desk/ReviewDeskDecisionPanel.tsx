"use client";

import {
  CancelCircleIcon,
  CheckmarkCircle02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import {
  decideHubSpotWritebackAction,
  type ReviewDeskDecisionActionState,
} from "./actions";

const initialState: ReviewDeskDecisionActionState = {
  status: "idle",
  message: null,
};

export function ReviewDeskDecisionPanel({
  hubSpotWritebackId,
  reviewDeskFeedbackNote,
}: {
  hubSpotWritebackId: string;
  reviewDeskFeedbackNote: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    decideHubSpotWritebackAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      <input
        type="hidden"
        name="hubSpotWritebackId"
        value={hubSpotWritebackId}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          name="intent"
          value="approve"
          size="lg"
          disabled={pending}
          className="gap-1.5"
        >
          <HugeiconsIcon
            icon={CheckmarkCircle02Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          {pending ? "Deciding" : "Approve & apply"}
        </Button>
        <Button
          type="submit"
          name="intent"
          value="reject"
          variant="outline"
          size="lg"
          disabled={pending}
          className="gap-1.5"
        >
          <HugeiconsIcon
            icon={CancelCircleIcon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          {pending ? "Deciding" : "Reject"}
        </Button>
        {state.status === "error" && state.message ? (
          <p className="text-xs text-destructive">{state.message}</p>
        ) : null}
      </div>
      <details className="group rounded-md border border-border bg-canvas px-3 py-2">
        <summary className="cursor-pointer text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground transition-colors group-open:text-foreground hover:text-foreground">
          Leave feedback for the AI
        </summary>
        <div className="mt-3 flex flex-col gap-1.5">
          <label
            htmlFor="reviewDeskFeedbackNote"
            className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground"
          >
            Note
          </label>
          <Textarea
            id="reviewDeskFeedbackNote"
            name="reviewDeskFeedbackNote"
            defaultValue={reviewDeskFeedbackNote ?? ""}
            placeholder="Optional — what should the AI know for next time?"
          />
        </div>
      </details>
    </form>
  );
}
