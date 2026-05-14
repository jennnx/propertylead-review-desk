import { Analytics01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";

import {
  getProductionUsageOverview,
  type UsageScorecardSummary,
  type UsageTimeWindowPreset,
} from "@/services/llm-telemetry";

import { TimeWindowSelector } from "./TimeWindowSelector";
import { UsageTrendChart } from "./UsageTrendChart";

const TIME_WINDOW_PRESETS: ReadonlyArray<{
  value: UsageTimeWindowPreset;
  label: string;
}> = [
  { value: "24h", label: "Last 24h" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all-time", label: "All time" },
];

const DEFAULT_WINDOW: UsageTimeWindowPreset = "30d";

function parseWindow(raw: string | string[] | undefined): UsageTimeWindowPreset {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const match = TIME_WINDOW_PRESETS.find((preset) => preset.value === value);
  return match?.value ?? DEFAULT_WINDOW;
}

export default async function UsagePage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string | string[] }>;
}) {
  const params = await searchParams;
  const window = parseWindow(params.window);

  const usage = await getProductionUsageOverview({
    window,
    now: new Date(),
  });

  const windowLabel =
    TIME_WINDOW_PRESETS.find((preset) => preset.value === window)?.label ??
    "Last 30 days";

  return (
    <main className="min-h-svh bg-canvas text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-10 lg:px-10">
        <header className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[28px] font-semibold leading-tight tracking-tight">
              Usage
            </h1>
            <p className="text-sm text-muted-foreground">
              Spend, volume, and performance for every AI call PropertyLead
              makes.
            </p>
          </div>
          <TimeWindowSelector
            presets={TIME_WINDOW_PRESETS}
            value={window}
          />
        </header>

        <UsageScorecard
          scorecard={usage.scorecard}
          windowLabel={windowLabel}
        />

        <UsageTrendChart
          data={usage.dailyTrend}
          windowLabel={windowLabel}
        />
      </div>
    </main>
  );
}

function UsageScorecard({
  scorecard,
  windowLabel,
}: {
  scorecard: UsageScorecardSummary;
  windowLabel: string;
}) {
  const hasData = scorecard.callCount > 0;
  const hasPricedCalls = scorecard.pricedCallCount > 0;
  const quietHint = hasData
    ? `${scorecard.callCount} production call${scorecard.callCount === 1 ? "" : "s"} · ${windowLabel.toLowerCase()}`
    : "Quiet so far";

  return (
    <section className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-5">
        <ScorecardTile
          label="LLM calls"
          value={scorecard.callCount.toLocaleString("en-US")}
          hint={quietHint}
        />
        <ScorecardTile
          label="Total spend"
          value={formatUsd(scorecard.totalCostUsd)}
          hint={
            hasPricedCalls ? `${scorecard.pricedCallCount} priced` : quietHint
          }
        />
        <ScorecardTile
          label="Avg cost"
          value={
            hasPricedCalls
              ? formatUsd(scorecard.averageCostUsd ?? 0)
              : hasData
                ? "—"
                : "$0.00"
          }
          hint={hasPricedCalls ? "Per priced call" : quietHint}
        />
        <ScorecardTile
          label="Avg latency"
          value={
            scorecard.averageLatencyMs === null
              ? "0 ms"
              : `${Math.round(scorecard.averageLatencyMs).toLocaleString("en-US")} ms`
          }
          hint={hasData ? "Provider transport" : quietHint}
        />
        <ScorecardTile
          label="Success rate"
          value={
            scorecard.successRate === null
              ? "0%"
              : `${formatPercentage(scorecard.successRate)}%`
          }
          hint={hasData ? "Provider transport" : quietHint}
        />
      </div>
      {scorecard.costNullCount > 0 ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <HugeiconsIcon
            icon={Analytics01Icon}
            strokeWidth={1.75}
            className="size-3.5"
          />
          {scorecard.costNullCount.toLocaleString("en-US")} call
          {scorecard.costNullCount === 1 ? "" : "s"} without pricing data
        </p>
      ) : null}
      {!hasData ? (
        <p className="text-xs text-muted-foreground">
          Trigger a HubSpot Workflow Run from the{" "}
          <Link
            href="/review-desk"
            className="underline-offset-4 hover:underline"
          >
            Review Desk
          </Link>{" "}
          to populate this page.
        </p>
      ) : null}
    </section>
  );
}

function ScorecardTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="flex min-h-32 flex-col justify-between gap-4 bg-elevated px-5 py-4">
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </p>
        <p
          data-nums="tabular"
          className="text-2xl font-semibold leading-none tracking-tight text-foreground"
        >
          {value}
        </p>
      </div>
      <p className="text-[12px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function formatUsd(value: number): string {
  // For very small per-call costs ($0.000132 etc.), surface 6 decimal places
  // to match the schema precision rather than clamping to 4 and losing the
  // tail. Standard 2-digit display for everything from $1 up.
  const fractionDigits = value === 0 ? 2 : value < 0.01 ? 6 : value < 1 ? 4 : 2;
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  return formatter.format(value);
}

function formatPercentage(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
