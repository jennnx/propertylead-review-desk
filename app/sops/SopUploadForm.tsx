"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import {
  type SopUploadActionState,
  uploadSopDocumentAction,
} from "./actions";

const initialSopUploadActionState: SopUploadActionState = {
  status: "idle",
  message: null,
};

export function SopUploadForm() {
  const [state, formAction, pending] = useActionState(
    uploadSopDocumentAction,
    initialSopUploadActionState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          className="h-9 min-w-0 rounded-md border border-input bg-background px-3 py-1 text-sm file:mr-3 file:rounded-sm file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-xs file:font-medium file:text-secondary-foreground"
          name="file"
          type="file"
          accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf"
          required
          aria-describedby="sop-upload-message"
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Uploading" : "Upload"}
        </Button>
      </div>
      <p
        id="sop-upload-message"
        className={
          state.status === "error"
            ? "min-h-5 text-sm text-destructive"
            : "min-h-5 text-sm text-muted-foreground"
        }
      >
        {state.message}
      </p>
    </form>
  );
}
