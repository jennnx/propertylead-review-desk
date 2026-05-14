import { ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
const RECENT_ACTIVITY_LIMIT = 10;
const ACTIVITY_GRAPH_DAYS = 14;

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

  const headline = formatStatusHeadline(counts);
  const pendingPreview = pendingWritebacks.slice(0, PENDING_STRIP_LIMIT);
  const hasMorePending = pendingWritebacks.length > PENDING_STRIP_LIMIT;
  const recentActivity = decidedWritebacks.slice(0, RECENT_ACTIVITY_LIMIT);

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="flex flex-col gap-2 border-b border-border pb-5">
          <p className="text-sm font-medium text-muted-foreground">
            PropertyLead Review Desk
          </p>
          <h1 className="text-2xl font-semibold tracking-normal">Dashboard</h1>
          <p className="max-w-3xl text-base text-foreground">{headline}</p>
        </header>

        <DashboardActivityChart data={activityCounts} />

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold tracking-normal">
            Waiting for you
          </h2>
          {pendingPreview.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
              {autoMode.enabled
                ? "Nothing waiting -- Auto-approve is handling everything."
                : "Nothing waiting right now."}
            </div>
          ) : (
            <div className="grid gap-3">
              {pendingPreview.map((writeback) => (
                <DashboardWritebackCard
                  key={writeback.id}
                  writeback={writeback}
                />
              ))}
              {hasMorePending ? (
                <Link
                  href="/review-desk"
                  className="inline-flex items-center justify-center gap-1 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
                >
                  Open Review Desk
                  <HugeiconsIcon
                    icon={ArrowRight02Icon}
                    strokeWidth={2}
                    data-icon="inline-end"
                  />
                </Link>
              ) : null}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3 border-t border-border pt-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-normal">
              Recent activity
            </h2>
            {recentActivity.length > 0 ? (
              <Link
                href="/review-desk"
                className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                See full history
                <HugeiconsIcon
                  icon={ArrowRight02Icon}
                  strokeWidth={2}
                  data-icon="inline-end"
                />
              </Link>
            ) : null}
          </div>
          {recentActivity.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
              No AI decisions yet.
            </div>
          ) : (
            <div className="grid gap-3">
              {recentActivity.map((writeback) => (
                <DashboardWritebackCard
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

function DashboardWritebackCard({
  writeback,
}: {
  writeback: HubSpotWritebackReviewItem;
}) {
  return (
    <Link href={`/review-desk/${writeback.id}`} className="block">
      <Card size="sm" className="transition-colors hover:bg-muted/40">
        <CardHeader>
          <CardTitle>{writeback.triggerSummary}</CardTitle>
          <CardDescription>
            {writeback.contactName}
            {writeback.contactEmail ? ` - ${writeback.contactEmail}` : ""}
          </CardDescription>
          <CardAction>
            <OperatorSuggestionStateBadge state={writeback.state} />
          </CardAction>
        </CardHeader>
        <CardContent>
          <p className="max-w-3xl text-sm text-foreground">
            {writeback.recommendationSummary}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}

function formatStatusHeadline(counts: OperatorDashboardCounts): string {
  const {
    handledToday,
    autoApprovedToday,
    awaitingReviewToday,
    approvalRate30Days,
  } = counts;

  const approvalSuffix =
    approvalRate30Days === null
      ? ""
      : ` (${Math.round(approvalRate30Days * 100)}% approval rate this month.)`;

  if (handledToday === 0) {
    return `PropertyLead has been quiet today.${approvalSuffix}`;
  }

  const leadsPhrase = handledToday === 1 ? "1 lead" : `${handledToday} leads`;
  const autoApprovedPhrase = `${autoApprovedToday} auto-approved`;
  const waitingPhrase =
    awaitingReviewToday === 1
      ? "1 waiting for you"
      : `${awaitingReviewToday} waiting for you`;

  return `PropertyLead handled ${leadsPhrase} today -- ${autoApprovedPhrase}, ${waitingPhrase}.${approvalSuffix}`;
}
