"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { HubSpotWorkflowRunDailyCount } from "@/services/hubspot-workflows";

const chartConfig = {
  count: {
    label: "Leads",
    color: "var(--color-foreground)",
  },
} satisfies ChartConfig;

const dayLabelFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

export function DashboardActivityChart({
  data,
}: {
  data: HubSpotWorkflowRunDailyCount[];
}) {
  const total = data.reduce((sum, point) => sum + point.count, 0);
  const peak = data.reduce((max, point) => Math.max(max, point.count), 0);

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-elevated">
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[15px] font-semibold tracking-tight">
            Lead activity
          </h2>
          <p className="text-xs text-muted-foreground">
            Leads PropertyLead reviewed over the last {data.length} days.
          </p>
        </div>
        <div className="flex items-center gap-6">
          <Stat label="Total" value={total} />
          <Stat label="Peak day" value={peak} />
        </div>
      </header>
      <div className="px-3 pt-4 pb-3">
        <ChartContainer config={chartConfig} className="h-40 w-full">
          <AreaChart
            data={data}
            margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="activity-fill" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--color-foreground)"
                  stopOpacity={0.18}
                />
                <stop
                  offset="100%"
                  stopColor="var(--color-foreground)"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
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
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              width={28}
              tick={{
                fill: "var(--color-muted-foreground)",
                fontSize: 11,
              }}
            />
            <ChartTooltip
              cursor={{ stroke: "var(--color-border-strong)", strokeWidth: 1 }}
              content={
                <ChartTooltipContent
                  indicator="line"
                  labelFormatter={(value) => formatDateLabel(String(value))}
                />
              }
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke="var(--color-foreground)"
              strokeWidth={1.5}
              fill="url(#activity-fill)"
              activeDot={{
                r: 3.5,
                fill: "var(--color-foreground)",
                stroke: "var(--color-elevated)",
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ChartContainer>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
      <span
        data-nums="tabular"
        className="text-[15px] font-semibold tracking-tight"
      >
        {value}
      </span>
    </div>
  );
}

function formatDateLabel(value: string): string {
  return dayLabelFormatter.format(parseLocalDateKey(value));
}

function parseLocalDateKey(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}
