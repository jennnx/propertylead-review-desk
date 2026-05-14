"use client";

import { Delete02Icon, SaveIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import {
  saveReviewDeskFeedbackNoteAction,
  type ReviewDeskFeedbackNoteActionState,
} from "./actions";

const initialState: ReviewDeskFeedbackNoteActionState = {
  status: "idle",
  message: null,
};

export function ReviewDeskFeedbackNoteEditor({
  hubSpotWritebackId,
  reviewDeskFeedbackNote,
}: {
  hubSpotWritebackId: string;
  reviewDeskFeedbackNote: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    saveReviewDeskFeedbackNoteAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex w-full flex-col gap-3">
      <input
        type="hidden"
        name="hubSpotWritebackId"
        value={hubSpotWritebackId}
      />
      <label
        htmlFor="decidedReviewDeskFeedbackNote"
        className="text-xs font-medium text-muted-foreground"
      >
        Give the AI feedback
      </label>
      <Textarea
        id="decidedReviewDeskFeedbackNote"
        name="reviewDeskFeedbackNote"
        defaultValue={reviewDeskFeedbackNote ?? ""}
        placeholder="Add operator context for future reviewers"
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            name="intent"
            value="save"
            size="lg"
            disabled={pending}
          >
            <HugeiconsIcon
              icon={SaveIcon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {pending ? "Saving" : "Save note"}
          </Button>
          <Button
            type="submit"
            name="intent"
            value="clear"
            variant="outline"
            size="lg"
            disabled={pending}
          >
            <HugeiconsIcon
              icon={Delete02Icon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            Clear
          </Button>
        </div>
        {state.message ? (
          <p
            className={
              state.status === "error"
                ? "text-sm text-destructive"
                : "text-sm text-muted-foreground"
            }
          >
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
