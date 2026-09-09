/**
 * Read-only: does the batch-create wizard offer templates nobody published?
 *
 * `app/checklists/new/page.tsx` filters on `active: true` and property scope,
 * but NOT on `publishedAt`. The publish gate exists so a Property Manager
 * reviews a question set before anyone can be assigned work from it — every
 * question type in the library was INFERRED from PDFs, so an unreviewed
 * template is a guess. If the wizard ignores publishedAt, that gate is
 * decorative.
 */
import { db } from "../lib/db";

async function main() {
  const leaking = await db.checklistTemplate.findMany({
    where: { active: true, publishedAt: null },
    select: {
      code: true,
      name: true,
      allProperties: true,
      _count: { select: { questions: true, instances: true } },
    },
    orderBy: { code: "asc" },
  });

  console.log(`ACTIVE but UNPUBLISHED — would appear in the wizard: ${leaking.length}`);
  for (const t of leaking) {
    console.log(
      "  " +
        t.code.padEnd(9) +
        String(t._count.questions).padStart(3) +
        "q  " +
        (t.allProperties ? "ALL   " : "scoped") +
        "  instances:" +
        String(t._count.instances).padStart(3) +
        "  " +
        t.name,
    );
  }

  const published = await db.checklistTemplate.count({
    where: { active: true, publishedAt: { not: null } },
  });
  console.log(`\npublished + active (legitimately offerable): ${published}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
