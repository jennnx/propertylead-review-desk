"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";

import {
  type SopDeleteActionState,
  deleteSopDocumentAction,
} from "./actions";

const initialState: SopDeleteActionState = {
  status: "idle",
  message: null,
};

export function SopDocumentDeleteButton({
  sopDocumentId,
  originalFilename,
}: {
  sopDocumentId: string;
  originalFilename: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState(
    deleteSopDocumentAction,
    initialState,
  );

  if (!confirming) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setConfirming(true)}
        >
          Delete
        </Button>
        {state.status === "error" && state.message ? (
          <p className="text-xs text-destructive">{state.message}</p>
        ) : null}
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="sopDocumentId" value={sopDocumentId} />
      <p className="text-xs text-muted-foreground">
        Delete {originalFilename}?
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => setConfirming(false)}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="destructive"
          size="sm"
          disabled={pending}
        >
          {pending ? "Deleting" : "Confirm delete"}
        </Button>
      </div>
    </form>
  );
}
