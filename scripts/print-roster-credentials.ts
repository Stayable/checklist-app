/**
 * Print the sign-in list for accounts that still hold their starting password.
 *
 * Run: pnpm dotenv -e .env.production.local -- tsx scripts/print-roster-credentials.ts
 *
 * Read-only. Derives each password with the SAME function that set it
 * (rosterPassword), so this list cannot drift from what is actually in the
 * database — a hand-maintained copy would.
 *
 * Anyone who has already chosen their own password drops off the list
 * automatically, because mustChangePassword goes false when they do. That is
 * the intended behaviour: this is a "who still needs telling" list, not a
 * password register.
 */
import { db } from "../lib/db";
import { rosterPassword } from "./set-roster-passwords";

const GROUP_ORDER: Record<string, number> = { CORPORATE: 0, MANAGER: 1, AGENT: 2 };
const GROUP_LABEL: Record<string, string> = {
  CORPORATE: "FULL ACCESS — every property, every section",
  MANAGER: "MANAGERS — checklist + network, their properties only",
  AGENT: "AGENTS — checklist only",
};

async function main() {
  const users = await db.user.findMany({
    where: {
      mustChangePassword: true,
      email: { not: { endsWith: "@contractors.invalid" } },
    },
    select: {
      email: true,
      name: true,
      role: true,
      properties: { select: { property: { select: { shortCode: true } } } },
    },
  });

  users.sort(
    (a, b) =>
      (GROUP_ORDER[a.role] ?? 9) - (GROUP_ORDER[b.role] ?? 9) || a.email.localeCompare(b.email),
  );

  const lines: string[] = ["Stayable Operations — sign-in details", "https://ops.rentstayable.com", ""];
  let group = "";
  for (const u of users) {
    if (u.role !== group) {
      group = u.role;
      lines.push("", GROUP_LABEL[group] ?? group);
    }
    const props = u.properties.map((p) => p.property.shortCode).sort().join(" ") || "all";
    lines.push(
      `${u.name.padEnd(18)} ${u.email.padEnd(30)} ${rosterPassword(u.email).padEnd(15)} ${props}`,
    );
  }
  lines.push(
    "",
    "Everyone must set their own password on first sign-in — the app will not let you",
    "past that screen until you do.",
    "On a new device you also get a one-time code by email at the same address.",
  );

  console.log(lines.join("\n"));
  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
