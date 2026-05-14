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
import { getHubSpotWritebackReview } from "@/services/hubspot-writebacks";

import { OperatorSuggestionStateBadge } from "../OperatorSuggestionStateBadge";
import { ReviewDeskDecisionPanel } from "../ReviewDeskDecisionPanel";
import { ReviewDeskFeedbackNoteEditor } from "../ReviewDeskFeedbackNoteEditor";

export default async function ReviewDeskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const writeback = await getHubSpotWritebackReview(id);

  if (!writeback) notFound();

  const isPending = writeback.state === "PENDING";

  return (
    <main className="min-h-svh bg-canvas text-foreground">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-10 lg:px-10">
        <Link
          href="/review-desk"
          className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <HugeiconsIcon
            icon={ArrowLeft02Icon}
            strokeWidth={2}
            className="size-3"
          />
          Back to Review Desk
        </Link>

        <header className="flex flex-col gap-3 border-b border-border pb-6">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-[24px] font-semibold leading-tight tracking-tight">
              {writeback.triggerSummary}
            </h1>
            <OperatorSuggestionStateBadge state={writeback.state} />
          </div>
          <dl className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
            <MetaItem label="Contact">
              <span className="font-medium text-foreground">
                {writeback.contactName}
              </span>
              {writeback.contactEmail ? (
                <span className="ml-1.5 text-muted-foreground">
                  {writeback.contactEmail}
                </span>
              ) : null}
            </MetaItem>
            <MetaItem label="Created">{formatDate(writeback.createdAt)}</MetaItem>
            {writeback.appliedAt ? (
              <MetaItem label="Applied">
                {formatDate(writeback.appliedAt)}
              </MetaItem>
            ) : null}
          </dl>
        </header>

        <section className="overflow-hidden rounded-xl border border-border bg-elevated">
          <div className="flex flex-col gap-4 border-b border-border px-5 py-5">
            <div className="flex flex-col gap-2">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Claude recommends
              </p>
              <p className="text-[15px] font-medium leading-relaxed text-foreground">
                {writeback.recommendationSummary}
              </p>
            </div>
            {writeback.plan.note ? (
              <figure className="flex flex-col gap-1.5">
                <figcaption className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  Note to add in HubSpot
                </figcaption>
                <blockquote className="whitespace-pre-line rounded-md border border-l-2 border-border bg-canvas px-3.5 py-3 text-[13.5px] leading-relaxed text-foreground/90">
                  {writeback.plan.note}
                </blockquote>
              </figure>
            ) : null}
          </div>
          <div className="px-5 py-4">
            {isPending ? (
              <ReviewDeskDecisionPanel
                hubSpotWritebackId={writeback.id}
                reviewDeskFeedbackNote={writeback.reviewDeskFeedbackNote}
              />
            ) : (
              <ReviewDeskFeedbackNoteEditor
                hubSpotWritebackId={writeback.id}
                reviewDeskFeedbackNote={writeback.reviewDeskFeedbackNote}
              />
            )}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Details
          </h2>
          <Accordion
            type="multiple"
            defaultValue={["reasoning"]}
            className="overflow-hidden rounded-xl border border-border bg-elevated"
          >
            <AccordionItem value="reasoning" className="border-b border-border last:border-0">
              <AccordionTrigger className="px-5 py-3.5 text-[13px] font-medium tracking-tight hover:no-underline">
                Why the AI suggested this
              </AccordionTrigger>
              <AccordionContent className="whitespace-pre-line px-5 pb-4 text-[13px] leading-relaxed text-foreground/85">
                {writeback.claudeReasoning}
              </AccordionContent>
            </AccordionItem>
            {writeback.plan.fieldUpdates.length > 0 ? (
              <AccordionItem value="plan" className="border-b border-border last:border-0">
                <AccordionTrigger className="px-5 py-3.5 text-[13px] font-medium tracking-tight hover:no-underline">
                  HubSpot field updates
                </AccordionTrigger>
                <AccordionContent className="px-5 pb-4">
                  <div className="overflow-hidden rounded-md border border-border bg-canvas">
                    <table className="w-full border-collapse text-[12px]">
                      <thead className="border-b border-border bg-muted/40 text-left text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-medium">Field</th>
                          <th className="px-3 py-2 font-medium">New value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {writeback.plan.fieldUpdates.map((update) => (
                          <tr
                            key={update.name}
                            className="border-t border-border first:border-t-0"
                          >
                            <td className="px-3 py-2.5 font-medium tracking-tight">
                              {update.label}
                            </td>
                            <td
                              data-nums="tabular"
                              className="px-3 py-2.5 text-foreground/80"
                            >
                              {formatPlanValue(update.value)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ) : null}
            <AccordionItem value="context" className="border-b border-border last:border-0">
              <AccordionTrigger className="px-5 py-3.5 text-[13px] font-medium tracking-tight hover:no-underline">
                Context used by the AI
              </AccordionTrigger>
              <AccordionContent className="px-5 pb-4">
                <pre className="max-h-[32rem] overflow-auto rounded-md border border-border bg-canvas p-3 font-mono text-[11px] leading-5 text-muted-foreground">
                  {JSON.stringify(writeback.enrichmentInputContext, null, 2)}
                </pre>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>
      </div>
    </main>
  );
}

function MetaItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
      <dd className="text-xs">{children}</dd>
    </div>
  );
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
