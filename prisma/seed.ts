/**
 * Seed script.
 *
 * Intentionally does NOT insert fake users, events, or "successful" dashboard
 * data — every row in this app must correspond to a real GitHub delivery and a
 * real action. This script only verifies connectivity so you know migrations +
 * DATABASE_URL are wired correctly.
 *
 * Run with: npm run db:seed
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.$queryRawUnsafe("SELECT 1");
  const users = await prisma.user.count();
  console.log(
    `✓ Database reachable. ${users} user(s) present. ` +
      `Sign in via GitHub OAuth to create your account and connect a repository.`,
  );
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
