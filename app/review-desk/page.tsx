import { ArrowRight02Icon, InboxIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getHubSpotWritebackAutoMode,
  listDecidedHubSpotWritebacks,
  listPendingHubSpotWritebacks,
  type HubSpotWritebackReviewItem,
} from "@/services/hubspot-writebacks";

import { ReviewDeskAutoModeSwitch } from "./ReviewDeskAutoModeSwitch";

export default async function ReviewDeskPage() {
  const [pendingWritebacks, decidedWritebacks, autoMode] = await Promise.all([
    listPendingHubSpotWritebacks(),
    listDecidedHubSpotWritebacks(),
    getHubSpotWritebackAutoMode(),
  ]);

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="flex flex-col gap-2 border-b border-border pb-5">
          <p className="text-sm font-medium text-muted-foreground">
            Review Desk
          </p>
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-semibold tracking-normal">
                Review Desk
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Review proposed HubSpot changes before they are applied.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <ReviewDeskAutoModeSwitch enabled={autoMode.enabled} />
              <Badge variant="secondary">
                {pendingWritebacks.length} pending
              </Badge>
              <Badge variant="outline">{decidedWritebacks.length} decided</Badge>
            </div>
          </div>
        </header>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-normal">
              Pending queue
            </h2>
            <Badge variant="secondary">{pendingWritebacks.length} pending</Badge>
          </div>
          {pendingWritebacks.length === 0 ? (
            <div className="flex min-h-52 flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border px-4 py-10 text-center">
              <HugeiconsIcon icon={InboxIcon} strokeWidth={2} />
              <p className="text-sm font-medium">No pending HubSpot Writebacks</p>
              <p className="max-w-md text-sm text-muted-foreground">
                New proposed writebacks will appear here after HubSpot Workflows
                finalize a plan.
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {pendingWritebacks.map((writeback) => (
                <ReviewDeskWritebackCard
                  key={writeback.id}
                  writeback={writeback}
                />
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3 border-t border-border pt-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-normal">
              Decision history
            </h2>
            <Badge variant="outline">{decidedWritebacks.length} decided</Badge>
          </div>
          {decidedWritebacks.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
              Applied and rejected HubSpot Writebacks will appear here.
            </div>
          ) : (
            <div className="grid gap-3">
              {decidedWritebacks.map((writeback) => (
                <ReviewDeskWritebackCard
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

function ReviewDeskWritebackCard({
  writeback,
}: {
  writeback: HubSpotWritebackReviewItem;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{writeback.triggerSummary}</CardTitle>
        <CardDescription>
          {writeback.contactName}
          {writeback.contactEmail ? ` - ${writeback.contactEmail}` : ""}
        </CardDescription>
        <CardAction>
          <DecisionBadge state={writeback.state} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="max-w-3xl text-sm text-foreground">
          {writeback.recommendationSummary}
        </p>
        <Link
          href={`/review-desk/${writeback.id}`}
          className="inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-md border border-border px-2.5 text-xs font-medium hover:bg-muted"
        >
          Open
          <HugeiconsIcon
            icon={ArrowRight02Icon}
            strokeWidth={2}
            data-icon="inline-end"
          />
        </Link>
      </CardContent>
    </Card>
  );
}

function DecisionBadge({ state }: { state: HubSpotWritebackReviewItem["state"] }) {
  if (state === "APPLIED") return <Badge>applied</Badge>;
  if (state === "REJECTED") return <Badge variant="destructive">rejected</Badge>;
  if (state === "AUTO_APPLIED") {
    return <Badge variant="secondary">auto-applied</Badge>;
  }
  return <Badge variant="outline">pending</Badge>;
}
