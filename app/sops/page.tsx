import { BookOpen01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import type { SopDocumentSummary } from "@/services/sop";
import { listSopDocuments } from "@/services/sop";

import { SopDocumentDeleteButton } from "./SopDocumentDeleteButton";
import { SopUploadForm } from "./SopUploadForm";

export default async function SopsPage() {
  const documents = await listSopDocuments();

  return (
    <main className="min-h-svh bg-canvas text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-10 lg:px-10">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[28px] font-semibold leading-tight tracking-tight">
              SOP Library
            </h1>
            <p className="text-sm text-muted-foreground">
              Documents PropertyLead pulls from when deciding what to write back
              to HubSpot.
            </p>
          </div>
          <div className="w-full md:max-w-md">
            <SopUploadForm />
          </div>
        </header>

        {documents.length === 0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-elevated/40 px-6 py-10 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground ring-1 ring-border">
              <HugeiconsIcon icon={BookOpen01Icon} strokeWidth={1.75} />
            </span>
            <p className="text-sm font-medium tracking-tight">
              No SOPs uploaded yet
            </p>
            <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
              Upload a policy, lead playbook, or response template to give the
              AI more context when reviewing leads.
            </p>
          </div>
        ) : (
          <SopDocumentsTable documents={documents} />
        )}
      </div>
    </main>
  );
}

function SopDocumentsTable({
  documents,
}: {
  documents: SopDocumentSummary[];
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-elevated">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-[13px]">
          <thead className="border-b border-border bg-canvas/60 text-left text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Filename</th>
              <th className="px-4 py-2.5 font-medium">Uploaded</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 text-right font-medium">Chunks</th>
              <th className="px-4 py-2.5 font-medium">Failure</th>
              <th className="px-4 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((document) => (
              <tr
                key={document.id}
                className="border-t border-border transition-colors hover:bg-canvas/50"
              >
                <td className="max-w-[18rem] truncate px-4 py-3 font-medium tracking-tight">
                  {document.originalFilename}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatUploadedAt(document.uploadedAt)}
                </td>
                <td className="px-4 py-3">
                  <SopDocumentStatus status={document.processingStatus} />
                </td>
                <td
                  data-nums="tabular"
                  className="px-4 py-3 text-right text-muted-foreground"
                >
                  {document.processingStatus === "READY"
                    ? document.chunkCount
                    : "—"}
                </td>
                <td className="max-w-[22rem] truncate px-4 py-3 text-muted-foreground">
                  {document.processingStatus === "FAILED"
                    ? document.failureMessage
                    : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <SopDocumentDeleteButton
                    sopDocumentId={document.id}
                    originalFilename={document.originalFilename}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SopDocumentStatus({
  status,
}: {
  status: SopDocumentSummary["processingStatus"];
}) {
  const tone = {
    PROCESSING: {
      label: "Processing",
      classes:
        "border-border bg-muted/60 text-muted-foreground",
      dot: "bg-muted-foreground/60",
    },
    READY: {
      label: "Ready",
      classes:
        "border-emerald-200/80 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300",
      dot: "bg-emerald-500",
    },
    FAILED: {
      label: "Failed",
      classes:
        "border-destructive/20 bg-destructive/10 text-destructive",
      dot: "bg-destructive",
    },
  }[status];

  return (
    <span
      className={`inline-flex h-5 items-center gap-1.5 rounded-full border px-2 text-[10px] font-medium uppercase tracking-[0.08em] ${tone.classes}`}
    >
      <span className={`size-1.5 rounded-full ${tone.dot}`} aria-hidden />
      {tone.label}
    </span>
  );
}

function formatUploadedAt(uploadedAt: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(uploadedAt);
}
