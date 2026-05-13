import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getHubSpotWritebackReview,
  type HubSpotWritebackReviewDetail,
} from "@/services/hubspot-writebacks";

import { ReviewDeskApproveButton } from "../ReviewDeskApproveButton";

export default async function ReviewDeskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const writeback = await getHubSpotWritebackReview(id);

  if (!writeback) notFound();

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <Link
          href="/review-desk"
          className="inline-flex w-fit items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <HugeiconsIcon
            icon={ArrowLeft02Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          Review Desk
        </Link>

        <Card>
          <CardHeader>
            <CardTitle>{writeback.triggerSummary}</CardTitle>
            <CardDescription>
              {writeback.contactName}
              {writeback.contactEmail ? ` - ${writeback.contactEmail}` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-base leading-7">
              {writeback.recommendationSummary}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <DecisionBadge writeback={writeback} />
              <span className="text-xs text-muted-foreground">
                Created {formatDate(writeback.createdAt)}
              </span>
            </div>
          </CardContent>
          {writeback.state === "PENDING" ? (
            <CardFooter>
              <ReviewDeskApproveButton hubSpotWritebackId={writeback.id} />
            </CardFooter>
          ) : null}
        </Card>

        <Accordion type="multiple" defaultValue={["plan"]}>
          <AccordionItem value="plan">
            <AccordionTrigger>Proposed HubSpot Writeback Plan</AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-col gap-4">
                {writeback.plan.fieldUpdates.length > 0 ? (
                  <div className="overflow-x-auto rounded-md border border-border">
                    <table className="w-full min-w-[640px] border-collapse text-sm">
                      <thead className="bg-muted/50 text-left text-xs font-medium uppercase text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2">Field</th>
                          <th className="px-3 py-2">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {writeback.plan.fieldUpdates.map((update) => (
                          <tr
                            key={update.name}
                            className="border-t border-border"
                          >
                            <td className="px-3 py-3 font-medium">
                              {update.label}
                            </td>
                            <td className="px-3 py-3 text-muted-foreground">
                              {formatPlanValue(update.value)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                {writeback.plan.note ? (
                  <div className="rounded-md border border-border bg-muted/30 p-3 text-sm leading-6">
                    {writeback.plan.note}
                  </div>
                ) : null}
              </div>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="reasoning">
            <AccordionTrigger>Claude Reasoning</AccordionTrigger>
            <AccordionContent>
              <p className="text-sm leading-6">{writeback.claudeReasoning}</p>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="context">
            <AccordionTrigger>Enrichment Input Context</AccordionTrigger>
            <AccordionContent>
              <pre className="max-h-[32rem] overflow-auto rounded-md bg-muted p-3 text-xs leading-5 text-muted-foreground">
                {JSON.stringify(writeback.enrichmentInputContext, null, 2)}
              </pre>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </main>
  );
}

function DecisionBadge({
  writeback,
}: {
  writeback: HubSpotWritebackReviewDetail;
}) {
  if (writeback.state === "APPLIED") {
    return <Badge>applied</Badge>;
  }
  if (writeback.state === "REJECTED") {
    return <Badge variant="destructive">rejected</Badge>;
  }
  if (writeback.state === "AUTO_APPLIED") {
    return <Badge variant="secondary">auto-applied</Badge>;
  }
  return <Badge variant="outline">pending</Badge>;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatPlanValue(value: string | number | boolean | null): string {
  if (value === null) return "(clear value)";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}
