import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { importWithRequiredEnv } from "@/tests/env";

const getProductionUsageOverview = vi.fn();

vi.mock("@/services/llm-telemetry", () => ({
  getProductionUsageOverview,
}));

vi.mock("./TimeWindowSelector", () => ({
  TimeWindowSelector: () => <div data-testid="time-window-selector" />,
}));

vi.mock("./UsageTrendChart", () => ({
  UsageTrendChart: () => <div data-testid="usage-trend-chart" />,
}));

describe("UsagePage", () => {
  beforeEach(() => {
    getProductionUsageOverview.mockReset();
  });

  test("renders per-provider spend chips beneath the total spend tile", async () => {
    getProductionUsageOverview.mockResolvedValue({
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
    expect(getProductionUsageOverview).toHaveBeenCalledWith({
      window: "7d",
      now: expect.any(Date),
    });
  });
});
