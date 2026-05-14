import { getProviderSpendInWindow, getTotalSpendInWindow } from "./queries";

export type UsageTimeWindowPreset = "24h" | "7d" | "30d" | "90d" | "all-time";

export type UsageTotalSpend = {
  totalCostUsd: number;
  callCount: number;
  costNullCount: number;
  providerBreakdown: UsageProviderSpend[];
};

export type UsageProviderSpend = {
  provider: "anthropic" | "voyage";
  totalCostUsd: number;
  callCount: number;
};

export async function getProductionUsageTotalSpend(input: {
  window: UsageTimeWindowPreset;
  now: Date;
}): Promise<UsageTotalSpend> {
  const from = resolveWindowStart(input.window, input.now);
  const [row, providerRows] = await Promise.all([
    getTotalSpendInWindow({
      from,
      to: input.now,
      source: "PRODUCTION",
    }),
    getProviderSpendInWindow({
      from,
      to: input.now,
      source: "PRODUCTION",
    }),
  ]);

  return {
    totalCostUsd: row.totalCostUsd,
    callCount: row.callCount,
    costNullCount: row.costNullCount,
    providerBreakdown: normalizeProviderBreakdown(providerRows),
  };
}

function normalizeProviderBreakdown(
  rows: Awaited<ReturnType<typeof getProviderSpendInWindow>>,
): UsageProviderSpend[] {
  const byProvider = new Map(rows.map((row) => [row.provider, row]));

  return [
    {
      provider: "anthropic",
      totalCostUsd: byProvider.get("ANTHROPIC")?.totalCostUsd ?? 0,
      callCount: byProvider.get("ANTHROPIC")?.callCount ?? 0,
    },
    {
      provider: "voyage",
      totalCostUsd: byProvider.get("VOYAGE")?.totalCostUsd ?? 0,
      callCount: byProvider.get("VOYAGE")?.callCount ?? 0,
    },
  ];
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
