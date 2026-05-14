import { beforeEach, describe, expect, test, vi } from "vitest";

import { importWithRequiredEnv } from "@/tests/env";

const findMany = vi.fn();

vi.mock("@/services/database", () => ({
  getPrismaClient: () => ({
    llmCall: {
      findMany,
    },
  }),
}));

describe("LLM usage overview queries", () => {
  beforeEach(() => {
    findMany.mockReset();
  });

  test("summarizes counts, cost, latency, success rate, and daily provider bins", async () => {
    findMany.mockResolvedValue([
      buildUsageRow({
        provider: "ANTHROPIC",
        costUsd: "0.10000000",
        inputTokens: 100,
        outputTokens: 50,
        cacheCreationTokens: 10,
        cacheReadTokens: 5,
        totalTokens: null,
        latencyMs: 100,
        status: "OK",
        createdAt: new Date("2026-05-12T12:00:00.000Z"),
      }),
      buildUsageRow({
        provider: "VOYAGE",
        costUsd: null,
        totalTokens: 1_000,
        latencyMs: 300,
        status: "ERROR",
        createdAt: new Date("2026-05-12T13:00:00.000Z"),
      }),
      buildUsageRow({
        provider: "VOYAGE",
        costUsd: { toString: () => "0.03000000" },
        totalTokens: 250,
        latencyMs: 200,
        status: "OK",
        createdAt: new Date("2026-05-14T09:00:00.000Z"),
      }),
    ]);

    const { getUsageOverviewInWindow } = await importWithRequiredEnv(() =>
      import("./queries"),
    );

    const overview = await getUsageOverviewInWindow({
      from: new Date(2026, 4, 12),
      to: new Date(2026, 4, 15),
      source: "PRODUCTION",
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          source: "PRODUCTION",
          createdAt: {
            gte: new Date(2026, 4, 12),
            lt: new Date(2026, 4, 15),
          },
        },
      }),
    );
    expect(overview.scorecard).toEqual({
      callCount: 3,
      totalCostUsd: 0.13,
      costNullCount: 1,
      pricedCallCount: 2,
      averageCostUsd: 0.065,
      averageLatencyMs: 200,
      successRate: (2 / 3) * 100,
      providerBreakdown: [
        { provider: "anthropic", totalCostUsd: 0.1, callCount: 1 },
        { provider: "voyage", totalCostUsd: 0.03, callCount: 2 },
      ],
    });
    expect(overview.dailyTrend).toEqual([
      {
        date: "2026-05-12",
        anthropic: { spendUsd: 0.1, callCount: 1, tokenCount: 165 },
        voyage: { spendUsd: 0, callCount: 1, tokenCount: 1_000 },
      },
      {
        date: "2026-05-13",
        anthropic: { spendUsd: 0, callCount: 0, tokenCount: 0 },
        voyage: { spendUsd: 0, callCount: 0, tokenCount: 0 },
      },
      {
        date: "2026-05-14",
        anthropic: { spendUsd: 0, callCount: 0, tokenCount: 0 },
        voyage: { spendUsd: 0.03, callCount: 1, tokenCount: 250 },
      },
    ]);
  });

  test("returns zero scorecard values and no trend rows for an empty window", async () => {
    findMany.mockResolvedValue([]);

    const { getUsageOverviewInWindow } = await importWithRequiredEnv(() =>
      import("./queries"),
    );

    const overview = await getUsageOverviewInWindow({
      from: new Date("2026-05-12T00:00:00.000Z"),
      to: new Date("2026-05-15T00:00:00.000Z"),
      source: "PRODUCTION",
    });

    expect(overview).toEqual({
      scorecard: {
        callCount: 0,
        totalCostUsd: 0,
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
  });

  test("bins trend rows by the local calendar day shown in the chart", async () => {
    findMany.mockResolvedValue([
      buildUsageRow({
        provider: "ANTHROPIC",
        costUsd: "0.02000000",
        inputTokens: 10,
        outputTokens: 5,
        latencyMs: 80,
        createdAt: new Date(2026, 4, 12, 23, 30),
      }),
    ]);

    const { getUsageOverviewInWindow } = await importWithRequiredEnv(() =>
      import("./queries"),
    );

    const overview = await getUsageOverviewInWindow({
      from: new Date(2026, 4, 12),
      to: new Date(2026, 4, 14),
      source: "PRODUCTION",
    });

    expect(overview.dailyTrend).toEqual([
      {
        date: "2026-05-12",
        anthropic: { spendUsd: 0.02, callCount: 1, tokenCount: 15 },
        voyage: { spendUsd: 0, callCount: 0, tokenCount: 0 },
      },
      {
        date: "2026-05-13",
        anthropic: { spendUsd: 0, callCount: 0, tokenCount: 0 },
        voyage: { spendUsd: 0, callCount: 0, tokenCount: 0 },
      },
    ]);
  });
});

function buildUsageRow(
  overrides: Partial<{
    provider: "ANTHROPIC" | "VOYAGE";
    inputTokens: number | null;
    outputTokens: number | null;
    cacheCreationTokens: number | null;
    cacheReadTokens: number | null;
    totalTokens: number | null;
    costUsd: unknown;
    latencyMs: number;
    status: "OK" | "ERROR";
    createdAt: Date;
  }> = {},
) {
  return {
    provider: "ANTHROPIC",
    inputTokens: null,
    outputTokens: null,
    cacheCreationTokens: null,
    cacheReadTokens: null,
    totalTokens: null,
    costUsd: null,
    latencyMs: 1,
    status: "OK",
    createdAt: new Date("2026-05-12T00:00:00.000Z"),
    ...overrides,
  };
}
