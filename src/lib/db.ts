import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
// Personal edition. All user data queries go through the repository layer with this scope.
// Replace with a verified session identity when adding accounts; never accept an ownerId from clients.
export function userScope() {
  return { ownerId: "personal" };
}
