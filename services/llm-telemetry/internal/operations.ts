import {
  countUsageDrilldownRowsInWindow,
  getUsageDrilldownFilterOptionsInWindow,
  getModelUsageBreakdownInWindow,
  getProviderUsageBreakdownInWindow,
  getUsageOverviewInWindow,
  listUsageDrilldownRowsInWindow,
  type LlmCallModelUsageBreakdown,
  type LlmCallProviderUsageBreakdown,
  type UsageDrilldownFilterOptions,
  type UsageDrilldownProvider,
  type UsageDrilldownRow,
  type UsageDrilldownStatus,
  type UsageDailyTrendPoint as UsageDailyTrendPointReadModel,
  type UsageOverviewReadModel,
  type UsageProviderSpend as UsageProviderSpendReadModel,
  type UsageScorecardSummary as UsageScorecardSummaryReadModel,
  type UsageTrendProviderPoint as UsageTrendProviderPointReadModel,
} from "./queries";

export type UsageTimeWindowPreset = "24h" | "7d" | "30d" | "90d" | "all-time";
export type UsageSourceFilter = "production" | "all";

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

export type UsageBreakdown = {
  providers: LlmCallProviderUsageBreakdown[];
  models: LlmCallModelUsageBreakdown[];
};

export type UsageDrilldown = {
  rows: UsageDrilldownRow[];
  filterOptions: UsageDrilldownFilterOptions;
  pageInfo: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    hasPreviousPage: boolean;
    hasNextPage: boolean;
  };
};

export type {
  UsageDrilldownProvider,
  UsageDrilldownRow,
  UsageDrilldownStatus,
};

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
  return getUsageOverview({ ...input, source: "production" });
}

export async function getUsageOverview(input: {
  window: UsageTimeWindowPreset;
  now: Date;
  source?: UsageSourceFilter;
}): Promise<UsageOverview> {
  const from = resolveWindowStart(input.window, input.now);
  return getUsageOverviewInWindow({
    from,
    to: input.now,
    sources: resolveSources(input.source ?? "production"),
  });
}

export async function getProductionUsageBreakdown(input: {
  window: UsageTimeWindowPreset;
  now: Date;
}): Promise<UsageBreakdown> {
  return getUsageBreakdown({ ...input, source: "production" });
}

export async function getUsageBreakdown(input: {
  window: UsageTimeWindowPreset;
  now: Date;
  source?: UsageSourceFilter;
}): Promise<UsageBreakdown> {
  const from = resolveWindowStart(input.window, input.now);
  const queryWindow = {
    from,
    to: input.now,
    sources: resolveSources(input.source ?? "production"),
  };
  const [providers, models] = await Promise.all([
    getProviderUsageBreakdownInWindow(queryWindow),
    getModelUsageBreakdownInWindow(queryWindow),
  ]);

  return { providers, models };
}

export async function getUsageDrilldown(input: {
  window: UsageTimeWindowPreset;
  now: Date;
  source?: UsageSourceFilter;
  providers: UsageDrilldownProvider[];
  modelAliases: string[];
  statuses: UsageDrilldownStatus[];
  page: number;
  pageSize: number;
}): Promise<UsageDrilldown> {
  const from = resolveWindowStart(input.window, input.now);
  const queryWindow = {
    from,
    to: input.now,
    sources: resolveSources(input.source ?? "production"),
  };
  const filteredWindow = {
    ...queryWindow,
    providers: input.providers.map(toDbProvider),
    modelAliases: input.modelAliases,
    statuses: input.statuses.map(toDbStatus),
  };
  const page = Math.max(1, Math.floor(input.page));
  const pageSize = Math.max(1, Math.floor(input.pageSize));
  const [totalCount, filterOptions] = await Promise.all([
    countUsageDrilldownRowsInWindow(filteredWindow),
    getUsageDrilldownFilterOptionsInWindow(queryWindow),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const resolvedPage = Math.min(page, totalPages);
  const rows = await listUsageDrilldownRowsInWindow({
    ...filteredWindow,
    skip: (resolvedPage - 1) * pageSize,
    take: pageSize,
  });

  return {
    rows,
    filterOptions,
    pageInfo: {
      page: resolvedPage,
      pageSize,
      totalCount,
      totalPages,
      hasPreviousPage: resolvedPage > 1,
      hasNextPage: resolvedPage < totalPages,
    },
  };
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

function resolveSources(
  source: UsageSourceFilter,
): Array<"PRODUCTION" | "EVAL"> {
  return source === "all" ? ["PRODUCTION", "EVAL"] : ["PRODUCTION"];
}

function toDbProvider(
  provider: UsageDrilldownProvider,
): "ANTHROPIC" | "VOYAGE" {
  return provider === "anthropic" ? "ANTHROPIC" : "VOYAGE";
}

function toDbStatus(status: UsageDrilldownStatus): "OK" | "ERROR" {
  return status === "ok" ? "OK" : "ERROR";
}
