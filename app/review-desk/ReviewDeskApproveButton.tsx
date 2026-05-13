"use client";

import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import {
  approveHubSpotWritebackAction,
  type ReviewDeskApproveActionState,
} from "./actions";

const initialState: ReviewDeskApproveActionState = {
  status: "idle",
  message: null,
};

export function ReviewDeskApproveButton({
  hubSpotWritebackId,
}: {
  hubSpotWritebackId: string;
}) {
  const [state, formAction, pending] = useActionState(
    approveHubSpotWritebackAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <input
        type="hidden"
        name="hubSpotWritebackId"
        value={hubSpotWritebackId}
      />
      <Button type="submit" size="lg" disabled={pending}>
        <HugeiconsIcon
          icon={CheckmarkCircle02Icon}
          strokeWidth={2}
          data-icon="inline-start"
        />
        {pending ? "Approving" : "Approve"}
      </Button>
      {state.status === "error" && state.message ? (
        <p className="max-w-md text-sm text-destructive">{state.message}</p>
      ) : null}
    </form>
  );
}
