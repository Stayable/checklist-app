import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const now = new Date();
  const users = await db.user.findMany({
    select: {
      email: true,
      role: true,
      active: true,
      failedLoginAttempts: true,
      lockedUntil: true,
      lastLoginAt: true,
    },
    orderBy: { role: "asc" },
  });
  console.log("users:", users.length);
  for (const u of users) {
    const locked = u.lockedUntil && u.lockedUntil > now;
    console.log(
      `${u.email} | ${u.role} | active=${u.active} | fails=${u.failedLoginAttempts} | locked=${locked ? "YES until " + u.lockedUntil?.toISOString() : "no"} | lastLogin=${u.lastLoginAt?.toISOString() ?? "never"}`,
    );
  }
}

main().finally(() => db.$disconnect());
