import type { SopDocumentSummary } from "@/services/sop";
import { listSopDocuments } from "@/services/sop";

import { SopUploadForm } from "./SopUploadForm";

export default async function SopsPage() {
  const documents = await listSopDocuments();

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-border pb-5 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-muted-foreground">
              SOP Library
            </p>
            <h1 className="text-2xl font-semibold tracking-normal">
              SOP Documents
            </h1>
          </div>
          <div className="w-full md:max-w-md">
            <SopUploadForm />
          </div>
        </header>

        {documents.length === 0 ? (
          <div className="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            No SOP Documents have been uploaded.
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
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead className="bg-muted/50 text-left text-xs font-medium uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Filename</th>
            <th className="px-3 py-2">Uploaded</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2 text-right">Chunks</th>
            <th className="px-3 py-2">Failure</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((document) => (
            <tr key={document.id} className="border-t border-border">
              <td className="max-w-[18rem] truncate px-3 py-3 font-medium">
                {document.originalFilename}
              </td>
              <td className="px-3 py-3 text-muted-foreground">
                {formatUploadedAt(document.uploadedAt)}
              </td>
              <td className="px-3 py-3">
                <SopDocumentStatus status={document.processingStatus} />
              </td>
              <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                {document.processingStatus === "READY"
                  ? document.chunkCount
                  : "-"}
              </td>
              <td className="max-w-[22rem] truncate px-3 py-3 text-muted-foreground">
                {document.processingStatus === "FAILED"
                  ? document.failureMessage
                  : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SopDocumentStatus({
  status,
}: {
  status: SopDocumentSummary["processingStatus"];
}) {
  const statusClasses = {
    PROCESSING: "border-border bg-secondary text-secondary-foreground",
    READY: "border-primary/20 bg-primary/10 text-primary",
    FAILED: "border-destructive/20 bg-destructive/10 text-destructive",
  }[status];

  return (
    <span
      className={`inline-flex h-6 items-center rounded-md border px-2 text-xs font-medium ${statusClasses}`}
    >
      {status.toLowerCase()}
    </span>
  );
}

function formatUploadedAt(uploadedAt: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(uploadedAt);
}
