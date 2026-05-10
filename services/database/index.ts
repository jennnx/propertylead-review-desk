export { disconnectPrismaClient, getPrismaClient } from "./internal/client";
export {
  checkDatabaseReachable,
  checkPgvectorInstalled,
  type CheckResult,
} from "./internal/checks";
export type { PrismaClient } from "@prisma/client";
