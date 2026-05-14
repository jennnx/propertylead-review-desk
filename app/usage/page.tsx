import { Analytics01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";

import {
  getProductionUsageBreakdown,
  getProductionUsageTotalSpend,
  type UsageTimeWindowPreset,
} from "@/services/llm-telemetry";

import { TimeWindowSelector } from "./TimeWindowSelector";
import { UsageBreakdownSections } from "./UsageBreakdownSections";

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

  const now = new Date();
  const [totalSpend, usageBreakdown] = await Promise.all([
    getProductionUsageTotalSpend({
      window,
      now,
    }),
    getProductionUsageBreakdown({
      window,
      now,
    }),
  ]);

  const hasData = totalSpend.callCount > 0;
  const allUncosted =
    hasData && totalSpend.costNullCount === totalSpend.callCount;
  const hasKnownCost = hasData && !allUncosted;
  const windowLabel =
    TIME_WINDOW_PRESETS.find((preset) => preset.value === window)?.label ??
    DEFAULT_WINDOW;

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

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-elevated/40 p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Total spend
            </p>
            {hasKnownCost ? (
              <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">
                {formatUsd(totalSpend.totalCostUsd)}
              </p>
            ) : (
              <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-muted-foreground">
                —
              </p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              {!hasData
                ? `No activity in ${windowLabel.toLowerCase()}`
                : allUncosted
                  ? `${totalSpend.callCount} call${totalSpend.callCount === 1 ? "" : "s"} without pricing data · ${windowLabel.toLowerCase()}`
                  : `${totalSpend.callCount} production call${totalSpend.callCount === 1 ? "" : "s"} · ${windowLabel.toLowerCase()}`}
            </p>
            {totalSpend.costNullCount > 0 && !allUncosted ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {totalSpend.costNullCount} call
                {totalSpend.costNullCount === 1 ? "" : "s"} without pricing data
              </p>
            ) : null}
          </div>
        </section>

        {!hasData ? (
          <NoActivityHint window={windowLabel} />
        ) : null}

        <UsageBreakdownSections
          breakdown={usageBreakdown}
          windowLabel={windowLabel}
        />
      </div>
    </main>
  );
}

function NoActivityHint({ window }: { window: string }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-elevated/40 px-6 py-10 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground ring-1 ring-border">
        <HugeiconsIcon icon={Analytics01Icon} strokeWidth={1.75} />
      </span>
      <p className="text-sm font-medium tracking-tight">
        No AI activity in {window.toLowerCase()}
      </p>
      <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
        Trigger a HubSpot Workflow Run from the{" "}
        <Link
          href="/review-desk"
          className="underline-offset-4 hover:underline"
        >
          Review Desk
        </Link>{" "}
        to populate this page.
      </p>
    </div>
  );
}

function formatUsd(value: number): string {
  // For very small per-call costs ($0.000132 etc.), surface 6 decimal places
  // to match the schema precision rather than clamping to 4 and losing the
  // tail. Standard 2-digit display for everything from $1 up.
  const fractionDigits = value < 0.01 ? 6 : value < 1 ? 4 : 2;
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  return formatter.format(value);
}
