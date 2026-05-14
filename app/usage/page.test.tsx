import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { importWithRequiredEnv } from "@/tests/env";

const getProductionUsageTotalSpend = vi.fn();

vi.mock("@/services/llm-telemetry", () => ({
  getProductionUsageTotalSpend,
}));

vi.mock("./TimeWindowSelector", () => ({
  TimeWindowSelector: () => <div data-testid="time-window-selector" />,
}));

describe("UsagePage", () => {
  beforeEach(() => {
    getProductionUsageTotalSpend.mockReset();
  });

  test("renders per-provider spend chips beneath the total spend tile", async () => {
    getProductionUsageTotalSpend.mockResolvedValue({
      totalCostUsd: 1.015,
      callCount: 2,
      costNullCount: 0,
      providerBreakdown: [
        { provider: "anthropic", totalCostUsd: 1, callCount: 1 },
        { provider: "voyage", totalCostUsd: 0.015, callCount: 1 },
      ],
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
    expect(getProductionUsageTotalSpend).toHaveBeenCalledWith({
      window: "7d",
      now: expect.any(Date),
    });
  });
});
