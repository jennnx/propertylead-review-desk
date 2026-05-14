import { beforeEach, describe, expect, test, vi } from "vitest";

import { importWithRequiredEnv } from "@/tests/env";

const getUsageOverviewInWindow = vi.fn();

vi.mock("./queries", () => ({
  getUsageOverviewInWindow,
}));

describe("LLM usage operations", () => {
  beforeEach(() => {
    getUsageOverviewInWindow.mockReset();
  });

  test("returns total spend from the production usage overview", async () => {
    getUsageOverviewInWindow.mockResolvedValue({
      scorecard: {
        totalCostUsd: 1.0375,
        callCount: 4,
        costNullCount: 0,
        pricedCallCount: 4,
        averageCostUsd: 0.259375,
        averageLatencyMs: 200,
        successRate: 100,
        providerBreakdown: [
          { provider: "anthropic", totalCostUsd: 1, callCount: 1 },
          { provider: "voyage", totalCostUsd: 0.0375, callCount: 3 },
        ],
      },
      dailyTrend: [],
    });

    const { getProductionUsageTotalSpend } = await importWithRequiredEnv(() =>
      import("./operations"),
    );
    const now = new Date("2026-05-14T12:00:00.000Z");

    await expect(
      getProductionUsageTotalSpend({ window: "24h", now }),
    ).resolves.toEqual({
      totalCostUsd: 1.0375,
      callCount: 4,
      costNullCount: 0,
      providerBreakdown: [
        { provider: "anthropic", totalCostUsd: 1, callCount: 1 },
        { provider: "voyage", totalCostUsd: 0.0375, callCount: 3 },
      ],
    });

    expect(getUsageOverviewInWindow).toHaveBeenCalledWith({
      from: new Date("2026-05-13T12:00:00.000Z"),
      to: now,
      source: "PRODUCTION",
    });
  });

  test("passes an all-time window through as an unbounded read", async () => {
    getUsageOverviewInWindow.mockResolvedValue({
      scorecard: {
        totalCostUsd: 2,
        callCount: 1,
        costNullCount: 0,
        pricedCallCount: 1,
        averageCostUsd: 2,
        averageLatencyMs: 100,
        successRate: 100,
        providerBreakdown: [
          { provider: "anthropic", totalCostUsd: 2, callCount: 1 },
          { provider: "voyage", totalCostUsd: 0, callCount: 0 },
        ],
      },
      dailyTrend: [],
    });

    const { getProductionUsageTotalSpend } = await importWithRequiredEnv(() =>
      import("./operations"),
    );

    const result = await getProductionUsageTotalSpend({
      window: "all-time",
      now: new Date("2026-05-14T12:00:00.000Z"),
    });

    expect(result.providerBreakdown).toEqual([
      { provider: "anthropic", totalCostUsd: 2, callCount: 1 },
      { provider: "voyage", totalCostUsd: 0, callCount: 0 },
    ]);
    expect(getUsageOverviewInWindow).toHaveBeenCalledWith(
      expect.objectContaining({ from: null, source: "PRODUCTION" }),
    );
  });
});
