import { beforeEach, describe, expect, test, vi } from "vitest";

import { importWithRequiredEnv } from "@/tests/env";

const findMany = vi.fn();
const queryRaw = vi.fn();

vi.mock("@/services/database", () => ({
  getPrismaClient: () => ({
    $queryRaw: queryRaw,
    llmCall: {
      findMany,
    },
  }),
}));

describe("LLM usage overview queries", () => {
  beforeEach(() => {
    findMany.mockReset();
    queryRaw.mockReset();
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
      sources: ["PRODUCTION"],
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          source: { in: ["PRODUCTION"] },
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
      sources: ["PRODUCTION"],
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
      sources: ["PRODUCTION"],
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

describe("LLM telemetry drilldown queries", () => {
  beforeEach(() => {
    findMany.mockReset();
    queryRaw.mockReset();
  });

  test("returns recent calls with originating context labels and all-source filtering", async () => {
    findMany.mockResolvedValue([
      buildDrilldownRow({
        id: "call-1",
        provider: "ANTHROPIC",
        modelAlias: "claude-sonnet-4-6",
        modelSnapshot: "claude-sonnet-4-6-20251022",
        inputTokens: 12_300,
        outputTokens: 540,
        cacheReadTokens: 8_100,
        costUsd: { toString: () => "0.03450000" },
        latencyMs: 1832,
        status: "OK",
        hubSpotWorkflowRunId: "workflow-run-1",
      }),
      buildDrilldownRow({
        id: "call-2",
        provider: "VOYAGE",
        modelAlias: "voyage-3-large",
        modelSnapshot: "voyage-3-large",
        totalTokens: 2400,
        costUsd: null,
        latencyMs: 210,
        status: "ERROR",
        sopDocumentId: "sop-1",
        sopDocument: { originalFilename: "Buyer intake playbook.pdf" },
      }),
    ]);

    const { listUsageDrilldownRowsInWindow } =
      await importWithRequiredEnv(() => import("./queries"));

    const rows = await listUsageDrilldownRowsInWindow({
      from: new Date("2026-05-01T00:00:00.000Z"),
      to: new Date("2026-05-14T00:00:00.000Z"),
      sources: ["PRODUCTION", "EVAL"],
      providers: ["ANTHROPIC"],
      modelAliases: ["claude-sonnet-4-6"],
      statuses: ["OK"],
      skip: 25,
      take: 25,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          source: { in: ["PRODUCTION", "EVAL"] },
          createdAt: {
            gte: new Date("2026-05-01T00:00:00.000Z"),
            lt: new Date("2026-05-14T00:00:00.000Z"),
          },
          provider: { in: ["ANTHROPIC"] },
          modelAlias: { in: ["claude-sonnet-4-6"] },
          status: { in: ["OK"] },
        },
        orderBy: { createdAt: "desc" },
        skip: 25,
        take: 25,
      }),
    );
    expect(rows).toEqual([
      {
        id: "call-1",
        provider: "anthropic",
        modelAlias: "claude-sonnet-4-6",
        modelSnapshot: "claude-sonnet-4-6-20251022",
        source: "production",
        inputTokens: 12300,
        outputTokens: 540,
        cacheCreationTokens: null,
        cacheReadTokens: 8100,
        totalTokens: null,
        costUsd: 0.0345,
        latencyMs: 1832,
        status: "ok",
        createdAt: new Date("2026-05-12T00:00:00.000Z"),
        hubSpotWorkflowRunId: "workflow-run-1",
        sopDocumentFilename: null,
      },
      {
        id: "call-2",
        provider: "voyage",
        modelAlias: "voyage-3-large",
        modelSnapshot: "voyage-3-large",
        source: "production",
        inputTokens: null,
        outputTokens: null,
        cacheCreationTokens: null,
        cacheReadTokens: null,
        totalTokens: 2400,
        costUsd: null,
        latencyMs: 210,
        status: "error",
        createdAt: new Date("2026-05-12T00:00:00.000Z"),
        hubSpotWorkflowRunId: null,
        sopDocumentFilename: "Buyer intake playbook.pdf",
      },
    ]);
  });
});

describe("LLM telemetry usage breakdown queries", () => {
  beforeEach(() => {
    findMany.mockReset();
    queryRaw.mockReset();
  });

  test("parses provider token aggregates and Anthropic cache-hit ratio", async () => {
    queryRaw.mockResolvedValue([
      {
        provider: "anthropic",
        callCount: BigInt(2),
        totalInputTokens: "1200",
        totalOutputTokens: "300",
        totalCacheCreationTokens: "100",
        totalCacheReadTokens: "500",
        totalTokens: "0",
        averageInputTokens: "600",
        averageOutputTokens: "150",
        averageCacheCreationTokens: "50",
        averageCacheReadTokens: "250",
        averageTotalTokens: "0",
        cacheHitRatio: "0.2777777777777778",
      },
      {
        provider: "voyage",
        callCount: 1,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCacheCreationTokens: 0,
        totalCacheReadTokens: 0,
        totalTokens: "2400",
        averageInputTokens: 0,
        averageOutputTokens: 0,
        averageCacheCreationTokens: 0,
        averageCacheReadTokens: 0,
        averageTotalTokens: "2400",
        cacheHitRatio: null,
      },
    ]);

    const { getProviderUsageBreakdownInWindow } =
      await importWithRequiredEnv(() => import("./queries"));

    const rows = await getProviderUsageBreakdownInWindow({
      from: new Date("2026-05-01T00:00:00.000Z"),
      to: new Date("2026-05-14T00:00:00.000Z"),
      sources: ["PRODUCTION"],
    });

    expect(rows).toEqual([
      {
        provider: "anthropic",
        callCount: 2,
        totalInputTokens: 1200,
        totalOutputTokens: 300,
        totalCacheCreationTokens: 100,
        totalCacheReadTokens: 500,
        totalTokens: 0,
        averageInputTokens: 600,
        averageOutputTokens: 150,
        averageCacheCreationTokens: 50,
        averageCacheReadTokens: 250,
        averageTotalTokens: 0,
        cacheHitRatio: 0.2777777777777778,
      },
      {
        provider: "voyage",
        callCount: 1,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCacheCreationTokens: 0,
        totalCacheReadTokens: 0,
        totalTokens: 2400,
        averageInputTokens: 0,
        averageOutputTokens: 0,
        averageCacheCreationTokens: 0,
        averageCacheReadTokens: 0,
        averageTotalTokens: 2400,
        cacheHitRatio: null,
      },
    ]);
  });

  test("builds the provider aggregate SQL with production window filtering and cache-hit math", async () => {
    queryRaw.mockResolvedValue([]);

    const { getProviderUsageBreakdownInWindow } =
      await importWithRequiredEnv(() => import("./queries"));
    const from = new Date("2026-05-01T00:00:00.000Z");
    const to = new Date("2026-05-14T00:00:00.000Z");

    await getProviderUsageBreakdownInWindow({
      from,
      to,
      sources: ["PRODUCTION"],
    });

    const sql = queryRaw.mock.calls[0][0] as {
      sql: string;
      values: unknown[];
    };
    expect(sql.values).toEqual(["production", to, from]);
    expect(sql.sql).toContain('WHERE source = ANY(ARRAY[?]::"LlmCallSource"[])');
    expect(sql.sql).toContain('AND "createdAt" < ?');
    expect(sql.sql).toContain('AND "createdAt" >= ?');
    expect(sql.sql).toContain('GROUP BY provider');
    expect(sql.sql).toContain('SUM("cacheReadTokens")');
    expect(sql.sql).toContain('SUM("cacheCreationTokens")');
    expect(sql.sql).toContain('AS "cacheHitRatio"');
  });

  test("parses per-model cost, token, and latency percentile aggregates", async () => {
    queryRaw.mockResolvedValue([
      {
        provider: "anthropic",
        modelAlias: "claude-future-4-9",
        callCount: "3",
        totalInputTokens: "3000",
        totalOutputTokens: "900",
        totalCacheCreationTokens: "120",
        totalCacheReadTokens: "480",
        totalTokens: "4500",
        totalCostUsd: { toString: () => "0.04210000" },
        averageLatencyMs: "812.5",
        p50LatencyMs: "780",
        p95LatencyMs: "1200.75",
      },
      {
        provider: "voyage",
        modelAlias: "voyage-3",
        callCount: BigInt(1),
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCacheCreationTokens: 0,
        totalCacheReadTokens: 0,
        totalTokens: "2048",
        totalCostUsd: null,
        averageLatencyMs: 90,
        p50LatencyMs: 90,
        p95LatencyMs: 90,
      },
    ]);

    const { getModelUsageBreakdownInWindow } =
      await importWithRequiredEnv(() => import("./queries"));

    const rows = await getModelUsageBreakdownInWindow({
      from: null,
      to: new Date("2026-05-14T00:00:00.000Z"),
      sources: ["PRODUCTION"],
    });

    expect(rows).toEqual([
      {
        provider: "anthropic",
        modelAlias: "claude-future-4-9",
        callCount: 3,
        totalInputTokens: 3000,
        totalOutputTokens: 900,
        totalCacheCreationTokens: 120,
        totalCacheReadTokens: 480,
        totalTokens: 4500,
        totalCostUsd: 0.0421,
        averageLatencyMs: 812.5,
        p50LatencyMs: 780,
        p95LatencyMs: 1200.75,
      },
      {
        provider: "voyage",
        modelAlias: "voyage-3",
        callCount: 1,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCacheCreationTokens: 0,
        totalCacheReadTokens: 0,
        totalTokens: 2048,
        totalCostUsd: null,
        averageLatencyMs: 90,
        p50LatencyMs: 90,
        p95LatencyMs: 90,
      },
    ]);
  });

  test("builds the per-model SQL with modelAlias grouping, cost sort, and latency percentiles", async () => {
    queryRaw.mockResolvedValue([]);

    const { getModelUsageBreakdownInWindow } =
      await importWithRequiredEnv(() => import("./queries"));
    const to = new Date("2026-05-14T00:00:00.000Z");

    await getModelUsageBreakdownInWindow({
      from: null,
      to,
      sources: ["PRODUCTION"],
    });

    const sql = queryRaw.mock.calls[0][0] as {
      sql: string;
      values: unknown[];
    };
    expect(sql.values).toEqual(["production", to]);
    expect(sql.sql).toContain('WHERE source = ANY(ARRAY[?]::"LlmCallSource"[])');
    expect(sql.sql).toContain('AND "createdAt" < ?');
    expect(sql.sql).not.toContain('AND "createdAt" >= ?');
    expect(sql.sql).toContain('GROUP BY provider, "modelAlias"');
    expect(sql.sql).toContain("percentile_cont(0.5)");
    expect(sql.sql).toContain("percentile_cont(0.95)");
    expect(sql.sql).toContain('ORDER BY SUM("costUsd") DESC NULLS LAST');
  });

  test("returns empty breakdowns when no rows qualify in the window", async () => {
    queryRaw.mockResolvedValue([]);

    const {
      getModelUsageBreakdownInWindow,
      getProviderUsageBreakdownInWindow,
    } = await importWithRequiredEnv(() => import("./queries"));

    await expect(
      getProviderUsageBreakdownInWindow({
        from: new Date("2026-05-14T00:00:00.000Z"),
        to: new Date("2026-05-15T00:00:00.000Z"),
        sources: ["PRODUCTION"],
      }),
    ).resolves.toEqual([]);

    await expect(
      getModelUsageBreakdownInWindow({
        from: new Date("2026-05-14T00:00:00.000Z"),
        to: new Date("2026-05-15T00:00:00.000Z"),
        sources: ["PRODUCTION"],
      }),
    ).resolves.toEqual([]);
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

function buildDrilldownRow(
  overrides: Partial<{
    id: string;
    provider: "ANTHROPIC" | "VOYAGE";
    modelAlias: string;
    modelSnapshot: string;
    source: "PRODUCTION" | "EVAL";
    inputTokens: number | null;
    outputTokens: number | null;
    cacheCreationTokens: number | null;
    cacheReadTokens: number | null;
    totalTokens: number | null;
    costUsd: unknown;
    latencyMs: number;
    status: "OK" | "ERROR";
    createdAt: Date;
    hubSpotWorkflowRunId: string | null;
    sopDocumentId: string | null;
    sopDocument: { originalFilename: string } | null;
  }> = {},
) {
  return {
    id: "call-1",
    provider: "ANTHROPIC",
    modelAlias: "claude-sonnet-4-6",
    modelSnapshot: "claude-sonnet-4-6",
    source: "PRODUCTION",
    inputTokens: null,
    outputTokens: null,
    cacheCreationTokens: null,
    cacheReadTokens: null,
    totalTokens: null,
    costUsd: null,
    latencyMs: 1,
    status: "OK",
    createdAt: new Date("2026-05-12T00:00:00.000Z"),
    hubSpotWorkflowRunId: null,
    sopDocumentId: null,
    sopDocument: null,
    ...overrides,
  };
}
