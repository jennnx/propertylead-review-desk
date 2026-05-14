import { beforeEach, describe, expect, test, vi } from "vitest";

import { importWithRequiredEnv } from "@/tests/env";

const getTotalSpendInWindow = vi.fn();
const getProviderSpendInWindow = vi.fn();

vi.mock("./queries", () => ({
  getTotalSpendInWindow,
  getProviderSpendInWindow,
}));

describe("getProductionUsageTotalSpend", () => {
  beforeEach(() => {
    getTotalSpendInWindow.mockReset();
    getProviderSpendInWindow.mockReset();
  });

  test("returns total spend with normalized Anthropic and Voyage provider breakdown", async () => {
    getTotalSpendInWindow.mockResolvedValue({
      totalCostUsd: 1.0375,
      callCount: 4,
      costNullCount: 0,
    });
    getProviderSpendInWindow.mockResolvedValue([
      { provider: "VOYAGE", totalCostUsd: 0.0375, callCount: 3 },
      { provider: "ANTHROPIC", totalCostUsd: 1, callCount: 1 },
    ]);

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

    expect(getTotalSpendInWindow).toHaveBeenCalledWith({
      from: new Date("2026-05-13T12:00:00.000Z"),
      to: now,
      source: "PRODUCTION",
    });
    expect(getProviderSpendInWindow).toHaveBeenCalledWith({
      from: new Date("2026-05-13T12:00:00.000Z"),
      to: now,
      source: "PRODUCTION",
    });
  });

  test("fills missing providers with zero values for stable usage chips", async () => {
    getTotalSpendInWindow.mockResolvedValue({
      totalCostUsd: 2,
      callCount: 1,
      costNullCount: 0,
    });
    getProviderSpendInWindow.mockResolvedValue([
      { provider: "ANTHROPIC", totalCostUsd: 2, callCount: 1 },
    ]);

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
    expect(getProviderSpendInWindow).toHaveBeenCalledWith(
      expect.objectContaining({ from: null, source: "PRODUCTION" }),
    );
  });
});
