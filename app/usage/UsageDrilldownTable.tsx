import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  UsageDrilldown,
  UsageDrilldownProvider,
  UsageDrilldownStatus,
  UsageSourceFilter,
  UsageTimeWindowPreset,
} from "@/services/llm-telemetry";

type UsageDrilldownQueryState = {
  window: UsageTimeWindowPreset;
  source: UsageSourceFilter;
  providers: UsageDrilldownProvider[];
  modelAliases: string[];
  statuses: UsageDrilldownStatus[];
  page: number;
};

export function UsageDrilldownTable({
  drilldown,
  query,
  windowLabel,
  sourceLabel,
}: {
  drilldown: UsageDrilldown;
  query: UsageDrilldownQueryState;
  windowLabel: string;
  sourceLabel: string;
}) {
  const hasActiveFilters =
    query.providers.length > 0 ||
    query.modelAliases.length > 0 ||
    query.statuses.length > 0;
  const hasCallsInWindow =
    drilldown.filterOptions.providers.length > 0 ||
    drilldown.filterOptions.modelAliases.length > 0 ||
    drilldown.filterOptions.statuses.length > 0;

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-[17px] font-semibold tracking-tight">
          Recent calls
        </h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {sourceLabel} calls in {windowLabel.toLowerCase()}, newest first.
        </p>
      </header>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-elevated/50 p-4">
        <FilterGroup
          label="Provider"
          options={drilldown.filterOptions.providers.map((provider) => ({
            value: provider,
            label: formatProvider(provider),
          }))}
          selected={query.providers}
          query={query}
          filterKey="providers"
        />
        <FilterGroup
          label="Model"
          options={drilldown.filterOptions.modelAliases.map((modelAlias) => ({
            value: modelAlias,
            label: modelAlias,
          }))}
          selected={query.modelAliases}
          query={query}
          filterKey="modelAliases"
        />
        <FilterGroup
          label="Status"
          options={drilldown.filterOptions.statuses.map((status) => ({
            value: status,
            label: formatStatus(status),
          }))}
          selected={query.statuses}
          query={query}
          filterKey="statuses"
        />
      </div>

      {drilldown.rows.length === 0 ? (
        <div className="flex min-h-36 items-center justify-center rounded-xl border border-dashed border-border bg-elevated/40 px-6 py-8 text-center">
          <p className="text-sm font-medium text-muted-foreground">
            {hasActiveFilters && hasCallsInWindow
              ? "No calls match these filters"
              : "No calls in this window"}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-elevated">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left text-xs">
              <thead className="bg-muted/40 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Timestamp</th>
                  <th className="px-5 py-3 font-medium">Provider</th>
                  <th className="px-5 py-3 font-medium">Model</th>
                  <th className="px-5 py-3 font-medium">Operation</th>
                  <th className="px-5 py-3 font-medium">Tokens</th>
                  <th className="px-5 py-3 text-right font-medium">Latency</th>
                  <th className="px-5 py-3 text-right font-medium">Cost</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Context</th>
                </tr>
              </thead>
              <tbody>
                {drilldown.rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-t border-border first:border-t-0"
                  >
                    <td
                      data-nums="tabular"
                      className="whitespace-nowrap px-5 py-3 text-muted-foreground"
                    >
                      {formatTimestamp(row.createdAt)}
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant="secondary">
                        {formatProvider(row.provider)}
                      </Badge>
                    </td>
                    <td
                      className="max-w-56 truncate px-5 py-3 font-medium"
                      title={row.modelSnapshot}
                    >
                      {row.modelAlias}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">
                      {formatOperation(row.provider)}
                    </td>
                    <td
                      data-nums="tabular"
                      className="whitespace-nowrap px-5 py-3"
                    >
                      {formatTokenSummary(row)}
                    </td>
                    <td data-nums="tabular" className="px-5 py-3 text-right">
                      {formatNumber(row.latencyMs)} ms
                    </td>
                    <td data-nums="tabular" className="px-5 py-3 text-right">
                      {row.costUsd === null ? "—" : formatUsd(row.costUsd)}
                    </td>
                    <td className="px-5 py-3">
                      <Badge
                        variant={row.status === "ok" ? "outline" : "secondary"}
                      >
                        {formatStatus(row.status)}
                      </Badge>
                    </td>
                    <td className="max-w-56 truncate px-5 py-3">
                      <ContextCell row={row} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <PaginationControls drilldown={drilldown} query={query} />
    </section>
  );
}

function FilterGroup<T extends string>({
  label,
  options,
  selected,
  query,
  filterKey,
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  selected: T[];
  query: UsageDrilldownQueryState;
  filterKey: "providers" | "modelAliases" | "statuses";
}) {
  if (options.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-16 shrink-0 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const isActive = selected.includes(option.value);
          return (
            <Link
              key={option.value}
              href={buildUsageHref(query, {
                [filterKey]: toggleValue(selected, option.value),
                page: 1,
              })}
              aria-pressed={isActive}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                isActive
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background/60 text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function PaginationControls({
  drilldown,
  query,
}: {
  drilldown: UsageDrilldown;
  query: UsageDrilldownQueryState;
}) {
  const { pageInfo } = drilldown;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
      <p data-nums="tabular">
        Page {pageInfo.page.toLocaleString("en-US")} of{" "}
        {pageInfo.totalPages.toLocaleString("en-US")} ·{" "}
        {pageInfo.totalCount.toLocaleString("en-US")} calls
      </p>
      <div className="flex items-center gap-2">
        {pageInfo.hasPreviousPage ? (
          <Link
            href={buildUsageHref(query, { page: pageInfo.page - 1 })}
            className="rounded-md border border-border bg-elevated px-3 py-1.5 font-medium text-foreground transition-colors hover:bg-muted"
          >
            Previous
          </Link>
        ) : (
          <span className="rounded-md border border-border px-3 py-1.5 font-medium opacity-50">
            Previous
          </span>
        )}
        {pageInfo.hasNextPage ? (
          <Link
            href={buildUsageHref(query, { page: pageInfo.page + 1 })}
            className="rounded-md border border-border bg-elevated px-3 py-1.5 font-medium text-foreground transition-colors hover:bg-muted"
          >
            Next
          </Link>
        ) : (
          <span className="rounded-md border border-border px-3 py-1.5 font-medium opacity-50">
            Next
          </span>
        )}
      </div>
    </div>
  );
}

function ContextCell({
  row,
}: {
  row: UsageDrilldown["rows"][number];
}) {
  if (row.provider === "anthropic" && row.hubSpotWorkflowRunId) {
    return (
      <Link
        href={`/review-desk/${row.hubSpotWorkflowRunId}`}
        className="font-medium underline-offset-4 hover:underline"
      >
        Review run
      </Link>
    );
  }

  if (row.provider === "voyage" && row.sopDocumentFilename) {
    return <span title={row.sopDocumentFilename}>{row.sopDocumentFilename}</span>;
  }

  return <span className="text-muted-foreground">—</span>;
}

function buildUsageHref(
  query: UsageDrilldownQueryState,
  updates: Partial<UsageDrilldownQueryState>,
): string {
  const next = { ...query, ...updates };
  const params = new URLSearchParams();

  if (next.window !== "30d") params.set("window", next.window);
  if (next.source === "all") params.set("source", "all");
  for (const provider of next.providers) params.append("provider", provider);
  for (const modelAlias of next.modelAliases) params.append("model", modelAlias);
  for (const status of next.statuses) params.append("status", status);
  if (next.page > 1) params.set("page", String(next.page));

  const queryString = params.toString();
  return queryString ? `/usage?${queryString}` : "/usage";
}

function toggleValue<T extends string>(selected: T[], value: T): T[] {
  return selected.includes(value)
    ? selected.filter((item) => item !== value)
    : [...selected, value];
}

function formatTokenSummary(row: UsageDrilldown["rows"][number]): string {
  if (row.provider === "voyage") {
    return `${formatCompactTokenCount(row.totalTokens ?? 0)} total`;
  }

  const cacheTokens = (row.cacheReadTokens ?? 0) + (row.cacheCreationTokens ?? 0);
  return `${formatCompactTokenCount(row.inputTokens ?? 0)} in / ${formatCompactTokenCount(
    row.outputTokens ?? 0,
  )} out / ${formatCompactTokenCount(cacheTokens)} cache`;
}

function formatCompactTokenCount(value: number): string {
  if (value >= 1_000) {
    const rounded = value / 1_000;
    return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}k`;
  }
  return formatNumber(value);
}

function formatTimestamp(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatProvider(provider: UsageDrilldownProvider): string {
  return provider === "anthropic" ? "Anthropic" : "Voyage";
}

function formatOperation(provider: UsageDrilldownProvider): string {
  return provider === "anthropic" ? "messages.create" : "embeddings";
}

function formatStatus(status: UsageDrilldownStatus): string {
  return status === "ok" ? "OK" : "Error";
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatUsd(value: number): string {
  const fractionDigits = value === 0 ? 2 : value < 0.01 ? 6 : value < 1 ? 4 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}
