import { getPrismaClient } from "@/services/database";

export async function listCompletedHubSpotWorkflowRunDates(input: {
  from: Date;
  to: Date;
}): Promise<Date[]> {
  const rows = await getPrismaClient().hubSpotWorkflowRun.findMany({
    where: {
      status: { in: ["SUCCEEDED", "FAILED"] },
      completedAt: {
        gte: input.from,
        lt: input.to,
      },
    },
    select: { completedAt: true },
  });

  return rows
    .map((row) => row.completedAt)
    .filter((completedAt): completedAt is Date => completedAt !== null);
}
