/**
 * Read-only: what is actually publishable work right now?
 *
 * Published + active only — a draft or retired template cannot legitimately
 * have a checklist created from it, so listing them would just be noise when
 * you are trying to pick one to assign.
 */
import { db } from "../lib/db";

async function main() {
  const templates = await db.checklistTemplate.findMany({
    where: { publishedAt: { not: null }, active: true },
    select: {
      code: true,
      name: true,
      scope: true,
      copies: true,
      version: true,
      allProperties: true,
      properties: { select: { property: { select: { shortCode: true } } } },
      _count: { select: { questions: true, instances: true } },
    },
    orderBy: { code: "asc" },
  });

  console.log(
    ["CODE".padEnd(9), "Q".padStart(4), "v", "SCOPE".padEnd(13), "COPIES".padEnd(13), "PROPERTIES".padEnd(26), "NAME"].join(" "),
  );
  for (const t of templates) {
    const props = t.allProperties
      ? "ALL"
      : t.properties.map((p) => p.property.shortCode).sort().join(",");
    console.log(
      [
        t.code.padEnd(9),
        String(t._count.questions).padStart(3) + "q",
        String(t.version),
        t.scope.padEnd(13),
        t.copies.padEnd(13),
        props.padEnd(26),
        t.name,
      ].join(" "),
    );
  }
  console.log(`\n${templates.length} published + active`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
