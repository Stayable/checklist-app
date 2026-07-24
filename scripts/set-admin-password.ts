// scripts/set-admin-password.ts
// Rotates an admin password (cost 12 bcrypt) and clears lockout fields so the
// new password works immediately.
// The password is NEVER hardcoded — supply it at run time so it never lands in
// git. Email defaults to admin@rentstayable.com; override with ADMIN_EMAIL.
// Run: dotenv -e .env.local -- tsx scripts/set-admin-password.ts '<new-password>'
//  or: ADMIN_NEW_PASSWORD='<new-password>' dotenv -e .env.local -- tsx scripts/set-admin-password.ts
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL ?? "admin@rentstayable.com";
  const password = process.env.ADMIN_NEW_PASSWORD ?? process.argv[2];
  if (!password) {
    throw new Error(
      "No password supplied. Pass it as the first CLI arg or set ADMIN_NEW_PASSWORD. " +
        "Refusing to run — passwords must never be hardcoded in this file.",
    );
  }
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
