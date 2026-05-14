import {
  getUsageOverviewInWindow,
  type UsageDailyTrendPoint as UsageDailyTrendPointReadModel,
  type UsageOverviewReadModel,
  type UsageProviderSpend as UsageProviderSpendReadModel,
  type UsageScorecardSummary as UsageScorecardSummaryReadModel,
  type UsageTrendProviderPoint as UsageTrendProviderPointReadModel,
} from "./queries";

export type UsageTimeWindowPreset = "24h" | "7d" | "30d" | "90d" | "all-time";

export type UsageTotalSpend = {
  totalCostUsd: number;
  callCount: number;
  costNullCount: number;
  providerBreakdown: UsageProviderSpend[];
};

export type UsageProviderSpend = UsageProviderSpendReadModel;
export type UsageOverview = UsageOverviewReadModel;
export type UsageScorecardSummary = UsageScorecardSummaryReadModel;
export type UsageTrendProviderPoint = UsageTrendProviderPointReadModel;
export type UsageDailyTrendPoint = UsageDailyTrendPointReadModel;

export async function getProductionUsageTotalSpend(input: {
  window: UsageTimeWindowPreset;
  now: Date;
}): Promise<UsageTotalSpend> {
  const overview = await getProductionUsageOverview(input);
  return {
    totalCostUsd: overview.scorecard.totalCostUsd,
    callCount: overview.scorecard.callCount,
    costNullCount: overview.scorecard.costNullCount,
    providerBreakdown: overview.scorecard.providerBreakdown,
  };
}

export async function getProductionUsageOverview(input: {
  window: UsageTimeWindowPreset;
  now: Date;
}): Promise<UsageOverview> {
  const from = resolveWindowStart(input.window, input.now);
  return getUsageOverviewInWindow({
    from,
    to: input.now,
    source: "PRODUCTION",
  });
}

function resolveWindowStart(
  window: UsageTimeWindowPreset,
  now: Date,
): Date | null {
  if (window === "all-time") return null;
  const millisAgo = WINDOW_MILLIS[window];
  return new Date(now.getTime() - millisAgo);
}

const WINDOW_MILLIS: Record<Exclude<UsageTimeWindowPreset, "all-time">, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
};
