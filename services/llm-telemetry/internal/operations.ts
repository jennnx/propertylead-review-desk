import { getTotalSpendInWindow } from "./queries";

export type UsageTimeWindowPreset = "24h" | "7d" | "30d" | "90d" | "all-time";

export type UsageTotalSpend = {
  totalCostUsd: number;
  callCount: number;
  costNullCount: number;
};

export async function getProductionUsageTotalSpend(input: {
  window: UsageTimeWindowPreset;
  now: Date;
}): Promise<UsageTotalSpend> {
  const from = resolveWindowStart(input.window, input.now);
  const row = await getTotalSpendInWindow({
    from,
    to: input.now,
    source: "PRODUCTION",
  });
  return {
    totalCostUsd: row.totalCostUsd,
    callCount: row.callCount,
    costNullCount: row.costNullCount,
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
