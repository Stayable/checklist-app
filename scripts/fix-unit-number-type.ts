/**
 * Retype the `Unit #` question from PHOTO to SHORT_TEXT on production.
 *
 * Run (dry run, writes nothing):
 *   pnpm dotenv -e .env.production.local -- tsx scripts/fix-unit-number-type.ts
 * Run for real:
 *   pnpm dotenv -e .env.production.local -- tsx scripts/fix-unit-number-type.ts --apply
 *
 * WHY A SCRIPT AND NOT A RE-SEED
 * The generator is fixed (scripts/build-connecteam-questions.ts), but the seed
 * writes questions only to a template that has NONE, and the reset script
 * deletes and recreates every question on its six codes -- which also deletes
 * checklist instances. Both are far too wide for a one-column change to four
 * rows. This touches exactly the rows it names and is idempotent.
 *
 * WHY THE CHANGE
 * `Unit #` rendered as a bare label in the ARR / DEP / LFLIP PDFs, which in that
 * format reads as PHOTO. The extraction recorded that and flagged it uncertain
 * in the same breath. The same prompt was read as TEXT on the Housekeeping
 * Checklist, and `Bldg and Unit #` on Room Inspection -- the only sample
 * anywhere that was actually answered -- holds free text ("B#121", "222",
 * "Bldg A unit 210"). A unit number is also the identifying field of the
 * submission: as a photo it cannot be searched, filtered or joined to a room.
 *
 * ⚠ Still unverified against Connecteam's real field definitions, which were
 * never visible. This is a better reading of the same evidence, not a fact.
 */
import { PrismaClient, QuestionType } from "@prisma/client";

const db = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const PROMPT = "Unit #";

async function main() {
  console.log(
    APPLY
      ? "MODE: --apply — this WILL write to production."
      : "MODE: dry run — nothing is written. Add --apply to execute.",
  );

  const rows = await db.question.findMany({
    where: { prompt: PROMPT },
    select: {
      id: true,
      type: true,
      required: true,
      photoMin: true,
      photoMax: true,
      template: { select: { code: true, name: true, publishedAt: true } },
      _count: { select: { responses: true } },
    },
    orderBy: { template: { code: "asc" } },
  });

  if (rows.length === 0) {
    console.log(`\nNo question found with prompt ${JSON.stringify(PROMPT)}. Nothing to do.`);
    return;
  }

  console.log(`\nRows matching prompt ${JSON.stringify(PROMPT)}\n${"-".repeat(44)}`);
  for (const r of rows) {
    const pub = r.template.publishedAt ? "PUBLISHED" : "draft";
    console.log(
      `  ${r.template.code.padEnd(9)} ${String(r.type).padEnd(12)} required=${String(r.required).padEnd(5)} ` +
        `responses=${r._count.responses}  ${pub}  ${r.template.name}`,
    );
  }

  // A response already recorded against a PHOTO question is a stored file
  // reference. Retyping the question underneath it would leave a text answer
  // pointing at an image. There are no instances today, but this must not be
  // the thing that discovers otherwise.
  const withResponses = rows.filter((r) => r._count.responses > 0);
  if (withResponses.length > 0) {
    console.error(
      `\nREFUSING: ${withResponses.length} of these questions already have responses ` +
        `(${withResponses.map((r) => r.template.code).join(", ")}). ` +
        `Retyping a question that has been answered needs a decision, not a script.`,
    );
    process.exitCode = 1;
    return;
  }

  const needsChange = rows.filter(
    (r) => r.type !== QuestionType.SHORT_TEXT || !r.required || r.photoMin !== null || r.photoMax !== null,
  );

  console.log(`\n${needsChange.length} of ${rows.length} row(s) need changing.`);
  if (needsChange.length === 0) {
    console.log("Already correct — nothing to do.");
    return;
  }
  for (const r of needsChange) {
    console.log(`  ${r.template.code.padEnd(9)} ${r.type} -> SHORT_TEXT, required -> true, photoMin/Max -> null`);
  }

  if (!APPLY) {
    console.log("\nDry run complete. Re-run with --apply to write.");
    return;
  }

  const res = await db.question.updateMany({
    where: { id: { in: needsChange.map((r) => r.id) } },
    data: {
      type: QuestionType.SHORT_TEXT,
      required: true,
      photoMin: null,
      photoMax: null,
    },
  });
  console.log(`\nUpdated ${res.count} row(s).`);

  const after = await db.question.findMany({
    where: { prompt: PROMPT },
    select: { type: true, required: true, template: { select: { code: true } } },
    orderBy: { template: { code: "asc" } },
  });
  console.log("\nAfter");
  for (const r of after) {
    console.log(`  ${r.template.code.padEnd(9)} ${r.type} required=${r.required}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
