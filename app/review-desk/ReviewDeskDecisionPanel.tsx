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
    <form action={formAction} className="flex w-full flex-col gap-3">
      <input
        type="hidden"
        name="hubSpotWritebackId"
        value={hubSpotWritebackId}
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="submit"
            name="intent"
            value="approve"
            size="lg"
            disabled={pending}
          >
            <HugeiconsIcon
              icon={CheckmarkCircle02Icon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {pending ? "Deciding" : "Approve"}
          </Button>
          <Button
            type="submit"
            name="intent"
            value="reject"
            variant="destructive"
            size="lg"
            disabled={pending}
          >
            <HugeiconsIcon
              icon={CancelCircleIcon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {pending ? "Deciding" : "Reject"}
          </Button>
        </div>
        {state.status === "error" && state.message ? (
          <p className="text-sm text-destructive">{state.message}</p>
        ) : null}
      </div>
      <details className="group rounded-md border border-dashed border-border px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
          Add optional feedback note
        </summary>
        <div className="mt-3 flex flex-col gap-2">
          <label
            htmlFor="reviewDeskFeedbackNote"
            className="text-xs font-medium text-muted-foreground"
          >
            Review Desk feedback note
          </label>
          <Textarea
            id="reviewDeskFeedbackNote"
            name="reviewDeskFeedbackNote"
            defaultValue={reviewDeskFeedbackNote ?? ""}
            placeholder="Optional operator note"
          />
        </div>
      </details>
    </form>
  );
}
