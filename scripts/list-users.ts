/** Read-only roster of app users, roles and property scope. Writes nothing. */
import { db } from "../lib/db";

async function main() {
  const users = await db.user.findMany({
    select: {
      email: true,
      name: true,
      role: true,
      active: true,
      mustChangePassword: true,
      properties: { select: { property: { select: { shortCode: true } } } },
    },
    orderBy: [{ role: "asc" }, { email: "asc" }],
  });

  for (const u of users) {
    const props = u.properties.map((p) => p.property.shortCode).sort().join(",") || "(none)";
    console.log(
      `${String(u.role).padEnd(13)} ${u.active ? " " : "x"} ${u.email.padEnd(36)} ${props}`,
    );
  }
  console.log(`\ntotal: ${users.length}`);

  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
