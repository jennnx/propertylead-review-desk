"use client";

import { Upload03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-elevated p-1.5 shadow-[0_1px_0_0_oklch(0_0_0/0.03)]">
        <input
          className="h-8 min-w-0 flex-1 rounded-md bg-transparent px-2 text-[12.5px] text-foreground file:mr-3 file:h-7 file:rounded-md file:border-0 file:bg-muted file:px-2 file:text-[11px] file:font-medium file:tracking-tight file:text-foreground hover:file:bg-muted/80"
          name="file"
          type="file"
          accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf"
          required
          aria-describedby="sop-upload-message"
        />
        <Button type="submit" disabled={pending} className="gap-1.5">
          <HugeiconsIcon
            icon={Upload03Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          {pending ? "Uploading" : "Upload"}
        </Button>
      </div>
      <p
        id="sop-upload-message"
        className={
          state.status === "error"
            ? "min-h-4 px-1 text-[11px] text-destructive"
            : "min-h-4 px-1 text-[11px] text-muted-foreground"
        }
      >
        {state.message ?? "Accepts .txt, .md, .pdf"}
      </p>
    </form>
  );
}
