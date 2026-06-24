// scripts/set-admin-password.ts
// Rotates admin@rentstayable.com password to StayableAdmin (cost 12 bcrypt).
// Clears any lockout fields so the new password works immediately.
// Run: dotenv -e .env.local -- tsx scripts/set-admin-password.ts
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const email = "admin@rentstayable.com";
  const password = "StayableAdmin";
  const passwordHash = await bcrypt.hash(password, 12);
  const res = await db.user.update({
    where: { email },
    data: { passwordHash, failedLoginAttempts: 0, lastFailedLoginAt: null, lockedUntil: null },
  });
  console.log(`Updated password for ${res.email}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
