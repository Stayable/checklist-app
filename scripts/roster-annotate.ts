/**
 * Read-only roster dump for on-site annotation. Writes NOTHING.
 *
 * list-users.ts omits the name and lastLoginAt, which are exactly the two
 * columns needed to decide who is a field person and who has already been in.
 */
import { db } from "../lib/db";
import { formatDateInET } from "../lib/datetime";
import { rosterPassword } from "./set-roster-passwords";

async function main() {
  const users = await db.user.findMany({
    select: {
      email: true,
      name: true,
      role: true,
      active: true,
      mustChangePassword: true,
      lastLoginAt: true,
      properties: { select: { property: { select: { shortCode: true } } } },
    },
    orderBy: [{ role: "asc" }, { email: "asc" }],
  });

  const head = `${"NAME".padEnd(20)} ${"EMAIL".padEnd(32)} ${"ROLE".padEnd(11)} ${"PROPERTIES".padEnd(22)} ${"LAST SIGN-IN".padEnd(14)} ${"START PW".padEnd(13)} ON`;
  console.log(head);
  console.log("-".repeat(head.length + 3));

  for (const u of users) {
    const props =
      u.properties.map((p) => p.property.shortCode).sort().join(" ") || "(all/none)";
    const last = u.lastLoginAt ? formatDateInET(u.lastLoginAt) : "never";
    console.log(
      `${(u.name ?? "").padEnd(20)} ${u.email.padEnd(32)} ${String(u.role).padEnd(11)} ${props.padEnd(22)} ${last.padEnd(14)} ${(u.mustChangePassword ? rosterPassword(u.email) : "own pw").padEnd(13)} ${u.active ? "" : "INACTIVE"}`,
    );
  }

  const active = users.filter((u) => u.active);
  console.log(
    `\n${users.length} rows · ${active.length} active · ${active.filter((u) => u.lastLoginAt).length} have signed in · ${active.filter((u) => !u.lastLoginAt).length} never have`,
  );

  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
