import { ArrowRight02Icon, InboxIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";

import { listWorkflowRunsPerDay } from "@/services/hubspot-workflows";
import {
  getHubSpotWritebackAutoMode,
  getOperatorDashboardCounts,
  listDecidedHubSpotWritebacks,
  listPendingHubSpotWritebacks,
  type HubSpotWritebackReviewItem,
  type OperatorDashboardCounts,
} from "@/services/hubspot-writebacks";

import { DashboardActivityChart } from "./DashboardActivityChart";
import { OperatorSuggestionStateBadge } from "./review-desk/OperatorSuggestionStateBadge";

const PENDING_STRIP_LIMIT = 5;
const RECENT_ACTIVITY_LIMIT = 8;
const ACTIVITY_GRAPH_DAYS = 7;

export default async function Home() {
  const [
    counts,
    autoMode,
    pendingWritebacks,
    decidedWritebacks,
    activityCounts,
  ] = await Promise.all([
    getOperatorDashboardCounts(),
    getHubSpotWritebackAutoMode(),
    listPendingHubSpotWritebacks(),
    listDecidedHubSpotWritebacks(),
    listWorkflowRunsPerDay(ACTIVITY_GRAPH_DAYS),
  ]);

  const pendingPreview = pendingWritebacks.slice(0, PENDING_STRIP_LIMIT);
  const hasMorePending = pendingWritebacks.length > PENDING_STRIP_LIMIT;
  const recentActivity = decidedWritebacks.slice(0, RECENT_ACTIVITY_LIMIT);
  const today = formatToday();

  return (
    <main className="min-h-svh bg-canvas text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-10 lg:px-10">
        <header className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-4">
            <h1 className="text-[28px] font-semibold leading-tight tracking-tight">
              Dashboard
            </h1>
            <span className="text-xs font-medium tracking-tight text-muted-foreground">
              {today}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            How PropertyLead has been moving leads through HubSpot today.
          </p>
        </header>

        <DashboardStats counts={counts} autoModeEnabled={autoMode.enabled} />

        <DashboardActivityChart data={activityCounts} />

        <section className="flex flex-col gap-4">
          <SectionHeader
            title="Needs your review"
            count={pendingWritebacks.length}
            href={hasMorePending ? "/review-desk" : undefined}
            cta="Open Review Desk"
          />
          {pendingPreview.length === 0 ? (
            <EmptyState
              message={
                autoMode.enabled
                  ? "Nothing waiting — Auto-approve is handling everything."
                  : "Nothing waiting right now."
              }
            />
          ) : (
            <div className="flex flex-col gap-2">
              {pendingPreview.map((writeback) => (
                <DashboardWritebackRow
                  key={writeback.id}
                  writeback={writeback}
                />
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <SectionHeader
            title="Recent activity"
            count={decidedWritebacks.length}
            href={decidedWritebacks.length > 0 ? "/review-desk" : undefined}
            cta="See full history"
          />
          {recentActivity.length === 0 ? (
            <EmptyState message="No AI decisions yet." />
          ) : (
            <div className="flex flex-col gap-2">
              {recentActivity.map((writeback) => (
                <DashboardWritebackRow
                  key={writeback.id}
                  writeback={writeback}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function DashboardStats({
  counts,
  autoModeEnabled,
}: {
  counts: OperatorDashboardCounts;
  autoModeEnabled: boolean;
}) {
  const { handledToday, autoApprovedToday, awaitingReviewToday, approvalRate30Days } =
    counts;

  const approvalRateLabel =
    approvalRate30Days === null
      ? "—"
      : `${Math.round(approvalRate30Days * 100)}%`;

  return (
    <section className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
      <StatTile
        label="Handled today"
        value={String(handledToday)}
        hint={handledToday === 0 ? "Quiet so far" : "Across PropertyLead workflows"}
      />
      <StatTile
        label="Auto-approved"
        value={String(autoApprovedToday)}
        hint={autoModeEnabled ? "Auto-mode is on" : "Auto-mode is off"}
        accent={autoApprovedToday > 0 ? "positive" : undefined}
      />
      <StatTile
        label="Awaiting review"
        value={String(awaitingReviewToday)}
        hint={
          awaitingReviewToday === 0
            ? "Inbox clear"
            : awaitingReviewToday === 1
              ? "1 sitting in your queue"
              : `${awaitingReviewToday} sitting in your queue`
        }
        accent={awaitingReviewToday > 0 ? "attention" : undefined}
      />
      <StatTile
        label="Approval rate"
        value={approvalRateLabel}
        hint="Last 30 days"
      />
    </section>
  );
}

function StatTile({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint: string;
  accent?: "positive" | "attention";
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
            : accent === "positive"
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-muted-foreground")
        }
      >
        {hint}
      </p>
    </div>
  );
}

function SectionHeader({
  title,
  count,
  href,
  cta,
}: {
  title: string;
  count: number;
  href?: string;
  cta: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <div className="flex items-baseline gap-2">
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        <span
          data-nums="tabular"
          className="text-xs text-muted-foreground"
        >
          {count}
        </span>
      </div>
      {href ? (
        <Link
          href={href}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {cta}
          <HugeiconsIcon
            icon={ArrowRight02Icon}
            strokeWidth={2}
            className="size-3"
          />
        </Link>
      ) : null}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-elevated/40 px-4 py-6 text-sm text-muted-foreground">
      <HugeiconsIcon
        icon={InboxIcon}
        strokeWidth={1.75}
        className="size-4 text-muted-foreground/70"
      />
      {message}
    </div>
  );
}

function DashboardWritebackRow({
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
        <OperatorSuggestionStateBadge state={writeback.state} />
      </div>
      <p className="line-clamp-2 text-[12.5px] leading-relaxed text-foreground/80">
        {writeback.recommendationSummary}
      </p>
    </Link>
  );
}

function formatToday(): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(new Date());
}
