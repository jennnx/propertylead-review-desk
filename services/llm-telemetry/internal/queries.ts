import { z } from "zod";

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

export type UsageScorecardSummary = {
  callCount: number;
  totalCostUsd: number;
  costNullCount: number;
  pricedCallCount: number;
  averageCostUsd: number | null;
  averageLatencyMs: number | null;
  successRate: number | null;
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
  };
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
