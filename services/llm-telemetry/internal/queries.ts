import { z } from "zod";

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

const providerSpendRowSchema = z.object({
  provider: z.enum(["ANTHROPIC", "VOYAGE"]),
  totalCostUsd: z
    .union([z.string(), z.number(), z.null()])
    .transform((value) => {
      if (value === null) return 0;
      if (typeof value === "number") return value;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }),
  callCount: z
    .union([z.bigint(), z.number()])
    .transform((value) => (typeof value === "bigint" ? Number(value) : value)),
});

export type LlmCallProviderSpend = z.infer<typeof providerSpendRowSchema>;

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

export async function getProviderSpendInWindow(input: {
  from: Date | null;
  to: Date;
  source: "PRODUCTION" | "EVAL";
}): Promise<LlmCallProviderSpend[]> {
  const rows = await getPrismaClient().llmCall.groupBy({
    by: ["provider"],
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

  return z.array(providerSpendRowSchema).parse(
    rows.map((row) => ({
      provider: row.provider,
      totalCostUsd: row._sum.costUsd?.toString() ?? null,
      callCount: row._count._all,
    })),
  );
}
