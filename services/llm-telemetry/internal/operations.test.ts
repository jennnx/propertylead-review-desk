import { beforeEach, describe, expect, test, vi } from "vitest";

import { importWithRequiredEnv } from "@/tests/env";

const getUsageOverviewInWindow = vi.fn();
const getProviderUsageBreakdownInWindow = vi.fn();
const getModelUsageBreakdownInWindow = vi.fn();
const listUsageDrilldownRowsInWindow = vi.fn();
const countUsageDrilldownRowsInWindow = vi.fn();
const getUsageDrilldownFilterOptionsInWindow = vi.fn();

vi.mock("./queries", () => ({
  countUsageDrilldownRowsInWindow,
  getModelUsageBreakdownInWindow,
  getProviderUsageBreakdownInWindow,
  getUsageOverviewInWindow,
  getUsageDrilldownFilterOptionsInWindow,
  listUsageDrilldownRowsInWindow,
}));

describe("LLM usage operations", () => {
  beforeEach(() => {
    countUsageDrilldownRowsInWindow.mockReset();
    getModelUsageBreakdownInWindow.mockReset();
    getProviderUsageBreakdownInWindow.mockReset();
    getUsageDrilldownFilterOptionsInWindow.mockReset();
    getUsageOverviewInWindow.mockReset();
    listUsageDrilldownRowsInWindow.mockReset();
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
      sources: ["PRODUCTION"],
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
      expect.objectContaining({ from: null, sources: ["PRODUCTION"] }),
    );
  });

  test("includes eval traffic for all-source overview reads", async () => {
    getUsageOverviewInWindow.mockResolvedValue({
      scorecard: {
        totalCostUsd: 3,
        callCount: 2,
        costNullCount: 0,
        pricedCallCount: 2,
        averageCostUsd: 1.5,
        averageLatencyMs: 150,
        successRate: 100,
        providerBreakdown: [
          { provider: "anthropic", totalCostUsd: 3, callCount: 2 },
          { provider: "voyage", totalCostUsd: 0, callCount: 0 },
        ],
      },
      dailyTrend: [],
    });

    const { getUsageOverview } = await importWithRequiredEnv(() =>
      import("./operations"),
    );
    const now = new Date("2026-05-14T12:00:00.000Z");

    await getUsageOverview({ window: "7d", now, source: "all" });

    expect(getUsageOverviewInWindow).toHaveBeenCalledWith({
      from: new Date("2026-05-07T12:00:00.000Z"),
      to: now,
      sources: ["PRODUCTION", "EVAL"],
    });
  });

  test("paginates drilldown reads while preserving filters and source mode", async () => {
    listUsageDrilldownRowsInWindow.mockResolvedValue([{ id: "call-1" }]);
    countUsageDrilldownRowsInWindow.mockResolvedValue(51);
    getUsageDrilldownFilterOptionsInWindow.mockResolvedValue({
      providers: ["anthropic"],
      modelAliases: ["claude-sonnet-4-6"],
      statuses: ["ok"],
    });

    const { getUsageDrilldown } = await importWithRequiredEnv(() =>
      import("./operations"),
    );
    const now = new Date("2026-05-14T12:00:00.000Z");

    await expect(
      getUsageDrilldown({
        window: "30d",
        now,
        source: "all",
        providers: ["anthropic"],
        modelAliases: ["claude-sonnet-4-6"],
        statuses: ["ok"],
        page: 2,
        pageSize: 25,
      }),
    ).resolves.toEqual({
      rows: [{ id: "call-1" }],
      filterOptions: {
        providers: ["anthropic"],
        modelAliases: ["claude-sonnet-4-6"],
        statuses: ["ok"],
      },
      pageInfo: {
        page: 2,
        pageSize: 25,
        totalCount: 51,
        totalPages: 3,
        hasPreviousPage: true,
        hasNextPage: true,
      },
    });
    const expectedWindow = {
      from: new Date("2026-04-14T12:00:00.000Z"),
      to: now,
      sources: ["PRODUCTION", "EVAL"],
      providers: ["ANTHROPIC"],
      modelAliases: ["claude-sonnet-4-6"],
      statuses: ["OK"],
    };
    expect(listUsageDrilldownRowsInWindow).toHaveBeenCalledWith({
      ...expectedWindow,
      skip: 25,
      take: 25,
    });
    expect(countUsageDrilldownRowsInWindow).toHaveBeenCalledWith(
      expectedWindow,
    );
    expect(getUsageDrilldownFilterOptionsInWindow).toHaveBeenCalledWith({
      from: expectedWindow.from,
      to: now,
      sources: ["PRODUCTION", "EVAL"],
    });
  });

  test("clamps drilldown pages past the result set to the last page", async () => {
    listUsageDrilldownRowsInWindow.mockResolvedValue([{ id: "call-26" }]);
    countUsageDrilldownRowsInWindow.mockResolvedValue(26);
    getUsageDrilldownFilterOptionsInWindow.mockResolvedValue({
      providers: [],
      modelAliases: [],
      statuses: [],
    });

    const { getUsageDrilldown } = await importWithRequiredEnv(() =>
      import("./operations"),
    );
    const now = new Date("2026-05-14T12:00:00.000Z");

    const drilldown = await getUsageDrilldown({
      window: "30d",
      now,
      source: "production",
      providers: [],
      modelAliases: [],
      statuses: [],
      page: 999,
      pageSize: 25,
    });

    expect(drilldown.pageInfo).toEqual({
      page: 2,
      pageSize: 25,
      totalCount: 26,
      totalPages: 2,
      hasPreviousPage: true,
      hasNextPage: false,
    });
    expect(listUsageDrilldownRowsInWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 25,
        take: 25,
      }),
    );
  });
});
