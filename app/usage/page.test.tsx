import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { importWithRequiredEnv } from "@/tests/env";

const getUsageOverview = vi.fn();
const getUsageBreakdown = vi.fn();
const getUsageDrilldown = vi.fn();

vi.mock("@/services/llm-telemetry", () => ({
  getUsageBreakdown,
  getUsageDrilldown,
  getUsageOverview,
}));

vi.mock("./TimeWindowSelector", () => ({
  TimeWindowSelector: () => <div data-testid="time-window-selector" />,
}));

vi.mock("./UsageSourceToggle", () => ({
  UsageSourceToggle: () => <div data-testid="usage-source-toggle" />,
}));

vi.mock("./UsageTrendChart", () => ({
  UsageTrendChart: () => <div data-testid="usage-trend-chart" />,
}));

describe("UsagePage", () => {
  beforeEach(() => {
    getUsageBreakdown.mockReset();
    getUsageDrilldown.mockReset();
    getUsageOverview.mockReset();
  });

  test("renders per-provider spend chips beneath the total spend tile", async () => {
    getUsageOverview.mockResolvedValue({
      scorecard: {
        totalCostUsd: 1.015,
        callCount: 2,
        costNullCount: 0,
        pricedCallCount: 2,
        averageCostUsd: 0.5075,
        averageLatencyMs: 200,
        successRate: 100,
        providerBreakdown: [
          { provider: "anthropic", totalCostUsd: 1, callCount: 1 },
          { provider: "voyage", totalCostUsd: 0.015, callCount: 1 },
        ],
      },
      dailyTrend: [],
    });
    getUsageBreakdown.mockResolvedValue({
      providers: [],
      models: [],
    });
    getUsageDrilldown.mockResolvedValue({
      rows: [],
      filterOptions: {
        providers: [],
        modelAliases: [],
        statuses: [],
      },
      pageInfo: {
        page: 1,
        pageSize: 25,
        totalCount: 0,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false,
      },
    });

    const { default: UsagePage } = await importWithRequiredEnv(() =>
      import("./page"),
    );
    const element = await UsagePage({
      searchParams: Promise.resolve({ window: "7d" }),
    });
    const markup = renderToStaticMarkup(element);

    expect(markup).toContain("Total spend");
    expect(markup).toContain("$1.02");
    expect(markup).toContain("Anthropic");
    expect(markup).toContain("$1.00");
    expect(markup).toContain("Voyage");
    expect(markup).toContain("$0.0150");
    expect(getUsageOverview).toHaveBeenCalledWith({
      window: "7d",
      now: expect.any(Date),
      source: "production",
    });
    expect(getUsageBreakdown).toHaveBeenCalledWith({
      window: "7d",
      now: expect.any(Date),
      source: "production",
    });
    expect(getUsageDrilldown).toHaveBeenCalledWith({
      window: "7d",
      now: expect.any(Date),
      source: "production",
      providers: [],
      modelAliases: [],
      statuses: [],
      page: 1,
      pageSize: 25,
    });
  });

  test("passes eval-source and drilldown filters from the URL", async () => {
    getUsageOverview.mockResolvedValue({
      scorecard: {
        totalCostUsd: 0,
        callCount: 0,
        costNullCount: 0,
        pricedCallCount: 0,
        averageCostUsd: null,
        averageLatencyMs: null,
        successRate: null,
        providerBreakdown: [
          { provider: "anthropic", totalCostUsd: 0, callCount: 0 },
          { provider: "voyage", totalCostUsd: 0, callCount: 0 },
        ],
      },
      dailyTrend: [],
    });
    getUsageBreakdown.mockResolvedValue({ providers: [], models: [] });
    getUsageDrilldown.mockResolvedValue({
      rows: [],
      filterOptions: {
        providers: ["anthropic"],
        modelAliases: ["claude-sonnet-4-6"],
        statuses: ["ok"],
      },
      pageInfo: {
        page: 3,
        pageSize: 25,
        totalCount: 0,
        totalPages: 1,
        hasPreviousPage: true,
        hasNextPage: false,
      },
    });

    const { default: UsagePage } = await importWithRequiredEnv(() =>
      import("./page"),
    );
    await UsagePage({
      searchParams: Promise.resolve({
        source: "all",
        provider: ["anthropic", "ignored"],
        model: "claude-sonnet-4-6",
        status: "ok",
        page: "3",
      }),
    });

    expect(getUsageOverview).toHaveBeenCalledWith(
      expect.objectContaining({ source: "all" }),
    );
    expect(getUsageBreakdown).toHaveBeenCalledWith(
      expect.objectContaining({ source: "all" }),
    );
    expect(getUsageDrilldown).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "all",
        providers: ["anthropic"],
        modelAliases: ["claude-sonnet-4-6"],
        statuses: ["ok"],
        page: 3,
      }),
    );
  });
});
