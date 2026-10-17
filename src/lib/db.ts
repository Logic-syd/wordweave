import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { readDatabaseConfig } from "./database-config";

// Validate on the first connection, not while Next.js imports routes for a build.
// An empty connectionString otherwise makes pg silently fall back to localhost.
class EnvironmentPrismaPg extends PrismaPg {
  override async connect() {
    const { connectionString } = readDatabaseConfig();
    return new PrismaPg({
      connectionString,
      connectionTimeoutMillis: 10000,
    }).connect();
  }
}
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new EnvironmentPrismaPg({}),
  });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
// Personal edition. All user data queries go through the repository layer with this scope.
// Replace with a verified session identity when adding accounts; never accept an ownerId from clients.
export function userScope() {
  return { ownerId: "personal" };
}
