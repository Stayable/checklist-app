/**
 * Read-only: why did editing a template not stick?
 *
 * Prints, per template: instance count, question count, how many questions
 * carry a `hint` / `options` / `conditional`, and the publish state. The
 * instance count is what `updateTemplate` guards on — any non-zero value makes
 * a question edit fail with "Duplicate the template instead."
 */
import { db } from "../lib/db";

async function main() {
  const rows = await db.checklistTemplate.findMany({
    orderBy: { code: "asc" },
    select: {
      code: true,
      name: true,
      publishedAt: true,
      active: true,
      _count: { select: { instances: true, questions: true } },
      questions: { select: { hint: true, options: true, conditional: true } },
    },
  });

  const pad = (s: string, n: number) => s.padEnd(n);
  console.log(
    pad("CODE", 10) + pad("INST", 6) + pad("Q", 5) + pad("hints", 7) +
      pad("opts", 6) + pad("cond", 6) + pad("published", 11) + "name",
  );
  let atRisk = 0;
  for (const t of rows) {
    const hints = t.questions.filter((q) => q.hint !== null && q.hint !== "").length;
    const opts = t.questions.filter((q) => q.options !== null).length;
    const cond = t.questions.filter((q) => q.conditional !== null).length;
    const locked = t._count.instances > 0;
    if (locked) atRisk++;
    console.log(
      pad(t.code, 10) +
        pad(String(t._count.instances) + (locked ? "*" : ""), 6) +
        pad(String(t._count.questions), 5) +
        pad(String(hints), 7) +
        pad(String(opts), 6) +
        pad(String(cond), 6) +
        pad(t.publishedAt ? (t.active ? "yes" : "retired") : "draft", 11) +
        t.name,
    );
  }
  console.log(
    "\n* = has instances, so `updateTemplate` REFUSES any question change. " +
      atRisk + " of " + rows.length + " templates are in that state.",
  );
  const totalHints = rows.reduce(
    (n, t) => n + t.questions.filter((q) => q.hint).length, 0,
  );
  console.log("hints that a single save on a 0-instance template would erase: " + totalHints);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
