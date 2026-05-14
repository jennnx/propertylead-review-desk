import { beforeEach, describe, expect, test, vi } from "vitest";

import { importWithRequiredEnv } from "@/tests/env";

const queryRaw = vi.fn();
const aggregate = vi.fn();
const count = vi.fn();

vi.mock("@/services/database", () => ({
  getPrismaClient: () => ({
    $queryRaw: queryRaw,
    llmCall: {
      aggregate,
      count,
    },
  }),
}));

describe("LLM telemetry usage breakdown queries", () => {
  beforeEach(() => {
    queryRaw.mockReset();
    aggregate.mockReset();
    count.mockReset();
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
      source: "PRODUCTION",
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
      source: "PRODUCTION",
    });

    const sql = queryRaw.mock.calls[0][0] as {
      sql: string;
      values: unknown[];
    };
    expect(sql.values).toEqual(["production", to, from]);
    expect(sql.sql).toContain('WHERE source = ?::"LlmCallSource"');
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
        totalCostUsd: "0.04210000",
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
      source: "PRODUCTION",
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
      source: "PRODUCTION",
    });

    const sql = queryRaw.mock.calls[0][0] as {
      sql: string;
      values: unknown[];
    };
    expect(sql.values).toEqual(["production", to]);
    expect(sql.sql).toContain('WHERE source = ?::"LlmCallSource"');
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
        source: "PRODUCTION",
      }),
    ).resolves.toEqual([]);

    await expect(
      getModelUsageBreakdownInWindow({
        from: new Date("2026-05-14T00:00:00.000Z"),
        to: new Date("2026-05-15T00:00:00.000Z"),
        source: "PRODUCTION",
      }),
    ).resolves.toEqual([]);
  });
});
