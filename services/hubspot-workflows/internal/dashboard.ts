import { listCompletedHubSpotWorkflowRunDates } from "./queries";

export type HubSpotWorkflowRunDailyCount = {
  date: string;
  count: number;
};

export async function listWorkflowRunsPerDay(
  daysBack: number,
): Promise<HubSpotWorkflowRunDailyCount[]> {
  const todayStart = startOfDay(new Date());
  const windowStart = addDays(todayStart, -(daysBack - 1));
  const windowEnd = addDays(todayStart, 1);

  const completedAt = await listCompletedHubSpotWorkflowRunDates({
    from: windowStart,
    to: windowEnd,
  });

  const counts = new Map<string, number>();
  for (let offset = 0; offset < daysBack; offset++) {
    counts.set(formatLocalDateKey(addDays(windowStart, offset)), 0);
  }
  for (const date of completedAt) {
    const key = formatLocalDateKey(date);
    if (counts.has(key)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries()).map(([date, count]) => ({ date, count }));
}

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
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
