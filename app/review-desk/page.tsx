import { ArrowRight02Icon, InboxIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";

import {
  listDecidedHubSpotWritebacks,
  listPendingHubSpotWritebacks,
  type HubSpotWritebackReviewItem,
} from "@/services/hubspot-writebacks";

import { OperatorSuggestionStateBadge } from "./OperatorSuggestionStateBadge";

export default async function ReviewDeskPage() {
  const [pendingWritebacks, decidedWritebacks] = await Promise.all([
    listPendingHubSpotWritebacks(),
    listDecidedHubSpotWritebacks(),
  ]);

  return (
    <main className="min-h-svh bg-canvas text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-10 lg:px-10">
        <header className="flex flex-col gap-1.5">
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight">
            Review Desk
          </h1>
          <p className="text-sm text-muted-foreground">
            Approve or reject the changes PropertyLead wants to apply to
            HubSpot.
          </p>
        </header>

        <section className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border">
          <SummaryTile
            label="Pending"
            value={pendingWritebacks.length}
            hint={
              pendingWritebacks.length === 0
                ? "Inbox clear"
                : "Waiting for a decision"
            }
            accent={pendingWritebacks.length > 0 ? "attention" : undefined}
          />
          <SummaryTile
            label="Decided"
            value={decidedWritebacks.length}
            hint="Approved & rejected"
          />
        </section>

        <section className="flex flex-col gap-4">
          <SectionHeader
            title="Pending queue"
            count={pendingWritebacks.length}
          />
          {pendingWritebacks.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-elevated/40 px-6 py-10 text-center">
              <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground ring-1 ring-border">
                <HugeiconsIcon icon={InboxIcon} strokeWidth={1.75} />
              </span>
              <p className="text-sm font-medium tracking-tight">
                Nothing waiting for review
              </p>
              <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
                New proposed writebacks appear here once PropertyLead finishes
                planning a HubSpot update.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {pendingWritebacks.map((writeback) => (
                <ReviewDeskRow key={writeback.id} writeback={writeback} />
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <SectionHeader
            title="Decision history"
            count={decidedWritebacks.length}
          />
          {decidedWritebacks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-elevated/40 px-4 py-8 text-sm text-muted-foreground">
              Applied and rejected writebacks will appear here.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {decidedWritebacks.map((writeback) => (
                <ReviewDeskRow key={writeback.id} writeback={writeback} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function SummaryTile({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: number;
  hint: string;
  accent?: "attention";
}) {
  return (
    <div className="flex flex-col gap-2 bg-elevated px-5 py-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p
        data-nums="tabular"
        className="text-[28px] font-semibold leading-none tracking-tight text-foreground"
      >
        {value}
      </p>
      <p
        className={
          "text-[12px] " +
          (accent === "attention"
            ? "text-amber-700 dark:text-amber-400"
            : "text-muted-foreground")
        }
      >
        {hint}
      </p>
    </div>
  );
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="flex items-baseline gap-2">
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        <span
          data-nums="tabular"
          className="text-xs text-muted-foreground"
        >
          {count}
        </span>
      </div>
    </div>
  );
}

function ReviewDeskRow({
  writeback,
}: {
  writeback: HubSpotWritebackReviewItem;
}) {
  return (
    <Link
      href={`/review-desk/${writeback.id}`}
      className="group flex flex-col gap-2 rounded-lg border border-border bg-elevated px-4 py-3.5 transition-all hover:border-border-strong hover:shadow-[0_1px_0_0_oklch(0_0_0/0.04),0_4px_12px_-8px_oklch(0_0_0/0.12)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="truncate text-[13px] font-medium tracking-tight">
            {writeback.triggerSummary}
          </p>
          <p className="truncate text-[12px] text-muted-foreground">
            {writeback.contactName}
            {writeback.contactEmail ? (
              <>
                <span className="mx-1.5 text-border-strong">·</span>
                {writeback.contactEmail}
              </>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <OperatorSuggestionStateBadge state={writeback.state} />
          <HugeiconsIcon
            icon={ArrowRight02Icon}
            strokeWidth={2}
            className="size-3.5 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
          />
        </div>
      </div>
      <p className="line-clamp-2 text-[12.5px] leading-relaxed text-foreground/80">
        {writeback.recommendationSummary}
      </p>
    </Link>
  );
}
