import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { env } from "@/lib/env";

let cached: PrismaClient | undefined;

export function getPrismaClient(): PrismaClient {
  if (!cached) {
    const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
    cached = new PrismaClient({ adapter });
  }
  return cached;
}

export async function disconnectPrismaClient(): Promise<void> {
  if (!cached) return;
  const client = cached;
  cached = undefined;
  await client.$disconnect();
}
