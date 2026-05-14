import { z } from "zod";
import { Prisma } from "@prisma/client";

import { getPrismaClient } from "@/services/database";

const llmCallUsageRowSchema = z.object({
  provider: z.enum(["ANTHROPIC", "VOYAGE"]),
  inputTokens: z.number().int().nullable(),
  outputTokens: z.number().int().nullable(),
  cacheCreationTokens: z.number().int().nullable(),
  cacheReadTokens: z.number().int().nullable(),
  totalTokens: z.number().int().nullable(),
  costUsd: z.unknown().transform(normalizeCostUsd),
  latencyMs: z.number().int(),
  status: z.enum(["OK", "ERROR"]),
  createdAt: z.date(),
});

const llmCallUsageRowsSchema = z.array(llmCallUsageRowSchema);

type LlmCallUsageRow = z.infer<typeof llmCallUsageRowSchema>;

export type UsageProviderSpend = {
  provider: "anthropic" | "voyage";
  totalCostUsd: number;
  callCount: number;
};

export type UsageScorecardSummary = {
  callCount: number;
  totalCostUsd: number;
  costNullCount: number;
  pricedCallCount: number;
  averageCostUsd: number | null;
  averageLatencyMs: number | null;
  successRate: number | null;
  providerBreakdown: UsageProviderSpend[];
};

export type UsageTrendProviderPoint = {
  spendUsd: number;
  callCount: number;
  tokenCount: number;
};

export type UsageDailyTrendPoint = {
  date: string;
  anthropic: UsageTrendProviderPoint;
  voyage: UsageTrendProviderPoint;
};

export type UsageOverviewReadModel = {
  scorecard: UsageScorecardSummary;
  dailyTrend: UsageDailyTrendPoint[];
};

export async function getUsageOverviewInWindow(input: {
  from: Date | null;
  to: Date;
  source: "PRODUCTION" | "EVAL";
}): Promise<UsageOverviewReadModel> {
  const prisma = getPrismaClient();
  const rows = llmCallUsageRowsSchema.parse(
    await prisma.llmCall.findMany({
      where: {
        source: input.source,
        createdAt: {
          ...(input.from ? { gte: input.from } : {}),
          lt: input.to,
        },
      },
      orderBy: { createdAt: "asc" },
      select: {
        provider: true,
        inputTokens: true,
        outputTokens: true,
        cacheCreationTokens: true,
        cacheReadTokens: true,
        totalTokens: true,
        costUsd: true,
        latencyMs: true,
        status: true,
        createdAt: true,
      },
    }),
  );

  return {
    scorecard: summarizeRows(rows),
    dailyTrend: buildDailyTrend(rows, input),
  };
}

function summarizeRows(rows: LlmCallUsageRow[]): UsageScorecardSummary {
  const callCount = rows.length;
  const totalCostUsd = rows.reduce(
    (sum, row) => sum + (row.costUsd ?? 0),
    0,
  );
  const costNullCount = rows.filter((row) => row.costUsd === null).length;
  const pricedCallCount = callCount - costNullCount;
  const totalLatencyMs = rows.reduce((sum, row) => sum + row.latencyMs, 0);
  const okCount = rows.filter((row) => row.status === "OK").length;

  return {
    callCount,
    totalCostUsd,
    costNullCount,
    pricedCallCount,
    averageCostUsd:
      pricedCallCount === 0 ? null : totalCostUsd / pricedCallCount,
    averageLatencyMs: callCount === 0 ? null : totalLatencyMs / callCount,
    successRate: callCount === 0 ? null : (okCount / callCount) * 100,
    providerBreakdown: buildProviderBreakdown(rows),
  };
}

function buildProviderBreakdown(
  rows: LlmCallUsageRow[],
): UsageProviderSpend[] {
  const breakdown = new Map<UsageProviderSpend["provider"], UsageProviderSpend>(
    [
      [
        "anthropic",
        { provider: "anthropic", totalCostUsd: 0, callCount: 0 },
      ],
      ["voyage", { provider: "voyage", totalCostUsd: 0, callCount: 0 }],
    ],
  );

  for (const row of rows) {
    const provider = row.provider === "ANTHROPIC" ? "anthropic" : "voyage";
    const current = breakdown.get(provider);
    if (!current) continue;
    current.callCount += 1;
    current.totalCostUsd += row.costUsd ?? 0;
  }

  return Array.from(breakdown.values());
}

function buildDailyTrend(
  rows: LlmCallUsageRow[],
  input: {
    from: Date | null;
    to: Date;
  },
): UsageDailyTrendPoint[] {
  if (rows.length === 0) return [];

  const firstDay = formatLocalDateKey(input.from ?? rows[0].createdAt);
  const lastDay = formatLocalDateKey(new Date(input.to.getTime() - 1));
  const trendByDay = new Map<string, UsageDailyTrendPoint>();

  for (const date of enumerateDays(firstDay, lastDay)) {
    trendByDay.set(date, createEmptyTrendPoint(date));
  }

  for (const row of rows) {
    const date = formatLocalDateKey(row.createdAt);
    const point = trendByDay.get(date) ?? createEmptyTrendPoint(date);
    const provider = row.provider === "ANTHROPIC" ? "anthropic" : "voyage";
    point[provider].callCount += 1;
    point[provider].spendUsd += row.costUsd ?? 0;
    point[provider].tokenCount += countTokens(row);
    trendByDay.set(date, point);
  }

  return Array.from(trendByDay.values());
}

function createEmptyTrendPoint(date: string): UsageDailyTrendPoint {
  return {
    date,
    anthropic: { spendUsd: 0, callCount: 0, tokenCount: 0 },
    voyage: { spendUsd: 0, callCount: 0, tokenCount: 0 },
  };
}

function countTokens(row: LlmCallUsageRow): number {
  if (row.totalTokens !== null) return row.totalTokens;
  return (
    (row.inputTokens ?? 0) +
    (row.outputTokens ?? 0) +
    (row.cacheCreationTokens ?? 0) +
    (row.cacheReadTokens ?? 0)
  );
}

function normalizeCostUsd(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") return parseCostUsd(value);
  if (
    typeof value === "object" &&
    value !== null &&
    "toString" in value &&
    typeof value.toString === "function"
  ) {
    return parseCostUsd(value.toString());
  }
  return 0;
}

function parseCostUsd(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function enumerateDays(from: string, to: string): string[] {
  const days: string[] = [];
  let cursor = parseLocalDateKey(from);
  const end = parseLocalDateKey(to);

  while (cursor.getTime() <= end.getTime()) {
    days.push(formatLocalDateKey(cursor));
    cursor = addDays(cursor, 1);
  }

  return days;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDateKey(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

const dbNumberSchema = z.coerce.number().finite().catch(0);

const nullableDbNumberSchema = z.coerce.number().finite().nullable().catch(null);

const llmCallProviderSchema = z.enum(["anthropic", "voyage"]);

const providerUsageBreakdownRowSchema = z.object({
  provider: llmCallProviderSchema,
  callCount: dbNumberSchema,
  totalInputTokens: dbNumberSchema,
  totalOutputTokens: dbNumberSchema,
  totalCacheCreationTokens: dbNumberSchema,
  totalCacheReadTokens: dbNumberSchema,
  totalTokens: dbNumberSchema,
  averageInputTokens: dbNumberSchema,
  averageOutputTokens: dbNumberSchema,
  averageCacheCreationTokens: dbNumberSchema,
  averageCacheReadTokens: dbNumberSchema,
  averageTotalTokens: dbNumberSchema,
  cacheHitRatio: nullableDbNumberSchema,
});

const modelUsageBreakdownRowSchema = z.object({
  provider: llmCallProviderSchema,
  modelAlias: z.string(),
  callCount: dbNumberSchema,
  totalInputTokens: dbNumberSchema,
  totalOutputTokens: dbNumberSchema,
  totalCacheCreationTokens: dbNumberSchema,
  totalCacheReadTokens: dbNumberSchema,
  totalTokens: dbNumberSchema,
  totalCostUsd: nullableDbNumberSchema,
  averageLatencyMs: dbNumberSchema,
  p50LatencyMs: dbNumberSchema,
  p95LatencyMs: dbNumberSchema,
});

export type LlmCallProviderUsageBreakdown = z.infer<
  typeof providerUsageBreakdownRowSchema
>;

export type LlmCallModelUsageBreakdown = z.infer<
  typeof modelUsageBreakdownRowSchema
>;

type UsageWindowQueryInput = {
  from: Date | null;
  to: Date;
  source: "PRODUCTION" | "EVAL";
};

export async function getProviderUsageBreakdownInWindow(
  input: UsageWindowQueryInput,
): Promise<LlmCallProviderUsageBreakdown[]> {
  const rows = await getPrismaClient().$queryRaw<unknown[]>(
    providerUsageBreakdownSql(input),
  );

  return z.array(providerUsageBreakdownRowSchema).parse(rows);
}

export async function getModelUsageBreakdownInWindow(
  input: UsageWindowQueryInput,
): Promise<LlmCallModelUsageBreakdown[]> {
  const rows = await getPrismaClient().$queryRaw<unknown[]>(
    modelUsageBreakdownSql(input),
  );

  return z.array(modelUsageBreakdownRowSchema).parse(rows);
}

function providerUsageBreakdownSql(input: UsageWindowQueryInput) {
  return Prisma.sql`
    SELECT
      provider::text AS "provider",
      COUNT(*)::int AS "callCount",
      COALESCE(SUM("inputTokens"), 0)::int AS "totalInputTokens",
      COALESCE(SUM("outputTokens"), 0)::int AS "totalOutputTokens",
      COALESCE(SUM("cacheCreationTokens"), 0)::int AS "totalCacheCreationTokens",
      COALESCE(SUM("cacheReadTokens"), 0)::int AS "totalCacheReadTokens",
      COALESCE(SUM("totalTokens"), 0)::int AS "totalTokens",
      (COALESCE(SUM("inputTokens"), 0)::float / COUNT(*)) AS "averageInputTokens",
      (COALESCE(SUM("outputTokens"), 0)::float / COUNT(*)) AS "averageOutputTokens",
      (COALESCE(SUM("cacheCreationTokens"), 0)::float / COUNT(*)) AS "averageCacheCreationTokens",
      (COALESCE(SUM("cacheReadTokens"), 0)::float / COUNT(*)) AS "averageCacheReadTokens",
      (COALESCE(SUM("totalTokens"), 0)::float / COUNT(*)) AS "averageTotalTokens",
      CASE
        WHEN provider = 'anthropic'
          AND COALESCE(SUM("inputTokens"), 0)
            + COALESCE(SUM("cacheReadTokens"), 0)
            + COALESCE(SUM("cacheCreationTokens"), 0) > 0
        THEN COALESCE(SUM("cacheReadTokens"), 0)::float
          / (
            COALESCE(SUM("inputTokens"), 0)
            + COALESCE(SUM("cacheReadTokens"), 0)
            + COALESCE(SUM("cacheCreationTokens"), 0)
          )
        WHEN provider = 'anthropic' THEN 0
        ELSE NULL
      END AS "cacheHitRatio"
    FROM llm_calls
    WHERE source = ${sourceDbValue(input.source)}::"LlmCallSource"
      AND "createdAt" < ${input.to}
      ${createdAtLowerBoundSql(input.from)}
    GROUP BY provider
    ORDER BY provider ASC
  `;
}

function modelUsageBreakdownSql(input: UsageWindowQueryInput) {
  return Prisma.sql`
    SELECT
      provider::text AS "provider",
      "modelAlias",
      COUNT(*)::int AS "callCount",
      COALESCE(SUM("inputTokens"), 0)::int AS "totalInputTokens",
      COALESCE(SUM("outputTokens"), 0)::int AS "totalOutputTokens",
      COALESCE(SUM("cacheCreationTokens"), 0)::int AS "totalCacheCreationTokens",
      COALESCE(SUM("cacheReadTokens"), 0)::int AS "totalCacheReadTokens",
      (
        COALESCE(SUM("inputTokens"), 0)
        + COALESCE(SUM("outputTokens"), 0)
        + COALESCE(SUM("cacheCreationTokens"), 0)
        + COALESCE(SUM("cacheReadTokens"), 0)
        + COALESCE(SUM("totalTokens"), 0)
      )::int AS "totalTokens",
      SUM("costUsd") AS "totalCostUsd",
      AVG("latencyMs")::float AS "averageLatencyMs",
      percentile_cont(0.5) WITHIN GROUP (ORDER BY "latencyMs")::float AS "p50LatencyMs",
      percentile_cont(0.95) WITHIN GROUP (ORDER BY "latencyMs")::float AS "p95LatencyMs"
    FROM llm_calls
    WHERE source = ${sourceDbValue(input.source)}::"LlmCallSource"
      AND "createdAt" < ${input.to}
      ${createdAtLowerBoundSql(input.from)}
    GROUP BY provider, "modelAlias"
    ORDER BY SUM("costUsd") DESC NULLS LAST, COUNT(*) DESC, provider ASC, "modelAlias" ASC
  `;
}

function createdAtLowerBoundSql(from: Date | null) {
  return from ? Prisma.sql`AND "createdAt" >= ${from}` : Prisma.empty;
}

function sourceDbValue(source: "PRODUCTION" | "EVAL"): "production" | "eval" {
  return source === "PRODUCTION" ? "production" : "eval";
}
