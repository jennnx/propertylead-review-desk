import { z } from "zod";
import { Prisma } from "@prisma/client";

import { getPrismaClient } from "@/services/database";

const totalSpendRowSchema = z.object({
  totalCostUsd: z
    .union([z.string(), z.number(), z.null()])
    .transform((value) => {
      if (value === null) return 0;
      if (typeof value === "number") return value;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }),
  costNullCount: z
    .union([z.bigint(), z.number()])
    .transform((value) => (typeof value === "bigint" ? Number(value) : value)),
  callCount: z
    .union([z.bigint(), z.number()])
    .transform((value) => (typeof value === "bigint" ? Number(value) : value)),
});

export type LlmCallTotalSpend = z.infer<typeof totalSpendRowSchema>;

export async function getTotalSpendInWindow(input: {
  from: Date | null;
  to: Date;
  source: "PRODUCTION" | "EVAL";
}): Promise<LlmCallTotalSpend> {
  const prisma = getPrismaClient();
  const aggregate = await prisma.llmCall.aggregate({
    where: {
      source: input.source,
      createdAt: {
        ...(input.from ? { gte: input.from } : {}),
        lt: input.to,
      },
    },
    _sum: { costUsd: true },
    _count: { _all: true },
  });

  const callCount = aggregate._count?._all ?? 0;

  const costNullAggregate = await prisma.llmCall.count({
    where: {
      source: input.source,
      costUsd: null,
      createdAt: {
        ...(input.from ? { gte: input.from } : {}),
        lt: input.to,
      },
    },
  });

  return totalSpendRowSchema.parse({
    totalCostUsd: aggregate._sum?.costUsd?.toString() ?? null,
    costNullCount: costNullAggregate,
    callCount,
  });
}

const dbNumberSchema = z
  .union([z.string(), z.number(), z.bigint(), z.null()])
  .transform((value) => {
    if (value === null) return 0;
    if (typeof value === "bigint") return Number(value);
    if (typeof value === "number") return value;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  });

const nullableDbNumberSchema = z
  .union([z.string(), z.number(), z.bigint(), z.null()])
  .transform((value) => {
    if (value === null) return null;
    if (typeof value === "bigint") return Number(value);
    if (typeof value === "number") return value;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  });

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
