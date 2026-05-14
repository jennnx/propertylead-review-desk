"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import type { UsageDailyTrendPoint } from "@/services/llm-telemetry";

type TrendMode = "spend" | "calls" | "tokens";

const TREND_MODES: ReadonlyArray<{ value: TrendMode; label: string }> = [
  { value: "spend", label: "Spend" },
  { value: "calls", label: "Calls" },
  { value: "tokens", label: "Tokens" },
];

const chartConfig = {
  anthropic: {
    label: "Anthropic",
    color: "var(--color-chart-1)",
  },
  voyage: {
    label: "Voyage",
    color: "var(--color-chart-3)",
  },
} satisfies ChartConfig;

const dayLabelFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

export function UsageTrendChart({
  data,
  windowLabel,
}: {
  data: UsageDailyTrendPoint[];
  windowLabel: string;
}) {
  const [mode, setMode] = useState<TrendMode>("spend");
  const chartData = useMemo(
    () =>
      data.map((point) => ({
        date: point.date,
        anthropic: readProviderValue(point.anthropic, mode),
        voyage: readProviderValue(point.voyage, mode),
      })),
    [data, mode],
  );

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-elevated">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[15px] font-semibold tracking-tight">
            Daily trend
          </h2>
          <p className="text-xs text-muted-foreground">
            Production {modeLabel(mode).toLowerCase()} by provider for{" "}
            {windowLabel.toLowerCase()}.
          </p>
        </div>
        <div
          role="radiogroup"
          aria-label="Trend metric"
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-background/70 p-1 text-xs"
        >
          {TREND_MODES.map((option) => {
            const isActive = option.value === mode;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => setMode(option.value)}
                className={cn(
                  "rounded-md px-3 py-1.5 font-medium transition-colors",
                  isActive
                    ? "bg-foreground text-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </header>

      {data.length === 0 ? (
        <div className="flex min-h-56 items-center justify-center px-6 py-10 text-sm text-muted-foreground">
          No activity in this window
        </div>
      ) : (
        <div className="px-3 pt-4 pb-3">
          <ChartContainer config={chartConfig} className="h-60 w-full">
            <BarChart
              data={chartData}
              margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                vertical={false}
                stroke="var(--color-border)"
                strokeDasharray="2 4"
              />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={10}
                minTickGap={28}
                tickFormatter={formatDateLabel}
                tick={{
                  fill: "var(--color-muted-foreground)",
                  fontSize: 11,
                }}
              />
              <YAxis
                allowDecimals={mode === "spend"}
                tickLine={false}
                axisLine={false}
                tickMargin={6}
                width={48}
                tickFormatter={(value) => formatAxisValue(Number(value), mode)}
                tick={{
                  fill: "var(--color-muted-foreground)",
                  fontSize: 11,
                }}
              />
              <ChartTooltip
                cursor={{
                  fill: "var(--color-muted)",
                  fillOpacity: 0.42,
                }}
                content={
                  <ChartTooltipContent
                    indicator="dot"
                    labelFormatter={(value) => formatDateLabel(String(value))}
                    formatter={(value, name) => (
                      <>
                        <span className="text-muted-foreground">
                          {providerLabel(name)}
                        </span>
                        <span className="font-mono font-medium text-foreground tabular-nums">
                          {formatTooltipValue(Number(value), mode)}
                        </span>
                      </>
                    )}
                  />
                }
              />
              <Bar
                dataKey="anthropic"
                stackId="provider"
                fill="var(--color-anthropic)"
                radius={[3, 3, 0, 0]}
              />
              <Bar
                dataKey="voyage"
                stackId="provider"
                fill="var(--color-voyage)"
                radius={[3, 3, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
        </div>
      )}
    </section>
  );
}

function readProviderValue(
  point: UsageDailyTrendPoint["anthropic"],
  mode: TrendMode,
): number {
  if (mode === "spend") return point.spendUsd;
  if (mode === "calls") return point.callCount;
  return point.tokenCount;
}

function modeLabel(mode: TrendMode): string {
  if (mode === "spend") return "Spend";
  if (mode === "calls") return "Call count";
  return "Token count";
}

function formatAxisValue(value: number, mode: TrendMode): string {
  if (mode === "spend") return value === 0 ? "$0" : `$${value.toFixed(2)}`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(value);
}

function formatTooltipValue(value: number, mode: TrendMode): string {
  if (mode === "spend") return formatUsd(value);
  return value.toLocaleString("en-US");
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

function providerLabel(name: unknown): string {
  if (name === "anthropic") return "Anthropic";
  if (name === "voyage") return "Voyage";
  return String(name);
}

function formatDateLabel(value: string): string {
  return dayLabelFormatter.format(parseLocalDateKey(value));
}

function parseLocalDateKey(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}
