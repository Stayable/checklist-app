/**
 * Restore the section headers that the extraction dropped from five templates,
 * and label the Maintenance Checklist's two repeated photo pairs.
 *
 * Run (dry run, writes nothing):
 *   pnpm dotenv -e .env.production.local -- tsx scripts/fix-missing-section-dividers.ts
 * Run for real:
 *   pnpm dotenv -e .env.production.local -- tsx scripts/fix-missing-section-dividers.ts --apply
 *
 * WHY THE CHANGE
 * The three extraction passes recorded section headers two different ways: PA /
 * MgrArrival tagged each question with a `section` field, Ops emitted the
 * headers as their own SECTION_DIVIDER rows. The generator read only the first
 * form and explicitly skipped inline divider rows on the assumption the other
 * path had already emitted them, so for the six Ops templates NEITHER path
 * fired and all 16 headers vanished.
 *
 * The visible damage: the Maintenance Checklist carries two identical
 * `Before` + `After` photo pairs with nothing telling them apart. Both are real
 * (4/4 samples) — one belongs to `Activities/Tasks`, the other to
 * `Transforming Spaces`. The generator is fixed
 * (scripts/build-connecteam-questions.ts); this applies the same result to the
 * templates already in the database.
 *
 * WHY IT APPENDS A VERSION INSTEAD OF EDITING ROWS (ADR-036)
 * HKC / MNT / RIN / PWR / RPM are published, and MNT and HKC have live
 * instances. `ChecklistInstance.templateVersion` pins which question set an
 * instance renders, and `responses_question_id_fkey` is ON DELETE RESTRICT.
 * So this script NEVER updates or deletes an existing question row. It bumps
 * `checklist_templates.version` and INSERTs a corrected set at the new number,
 * exactly as `updateTemplate` in app/templates/actions.ts does, reusing
 * `buildNextVersionRows` so the two paths cannot drift. Every checklist filled
 * before today keeps rendering the questions it was actually filled against.
 *
 * WHAT IT WILL NOT DO
 * It refuses a template whose current-version questions do not line up 1:1, in
 * order, with the generated set once dividers are set aside. A mismatch means
 * the database diverged from prisma/data/connecteam-questions.ts for some
 * reason this script does not know about, and guessing which row is which is
 * how you hand a question its neighbour's hint.
 *
 * It also carries every existing row's `type`, `required`, `photoMin/Max`,
 * `options`, `conditional` and `failFlagsIssue` forward untouched. This change
 * inserts headers and sets hints; it is not a re-seed and must not quietly
 * retype a field. Any drift it notices between the database and the generated
 * data is REPORTED, not corrected.
 */
import { PrismaClient, Prisma, QuestionType } from "@prisma/client";

import { CONNECTEAM_QUESTIONS } from "../prisma/data/connecteam-questions";
import {
  buildNextVersionRows,
  questionSetChanged,
  type ExistingQuestion,
  type IncomingQuestion,
} from "../lib/template-version";

const db = new PrismaClient();
const APPLY = process.argv.includes("--apply");

/**
 * The five templates the Ops extraction pass produced that actually have
 * headers. The other two Ops templates (PINSP, DOWALK) have no divider rows in
 * the source at all, so the generator's output for them did not change and they
 * are deliberately absent here.
 */
const CODES = ["HKC", "MNT", "RIN", "PWR", "RPM"] as const;

const isDivider = (t: QuestionType) => t === QuestionType.SECTION_DIVIDER;

type Plan = {
  code: string;
  name: string;
  templateId: string;
  currentVersion: number;
  nextVersion: number;
  instances: number;
  responses: number;
  addedDividers: string[];
  addedHints: { prompt: string; hint: string }[];
  drift: string[];
  incoming: IncomingQuestion[];
  existing: ExistingQuestion[];
};

async function planFor(code: string): Promise<Plan | { code: string; skip: string }> {
  const template = await db.checklistTemplate.findUnique({
    where: { code },
    select: { id: true, name: true, version: true, publishedAt: true },
  });
  if (!template) return { code, skip: "no template with this code" };

  const generated = CONNECTEAM_QUESTIONS[code];
  if (!generated || generated.length === 0) {
    return { code, skip: "no generated question set" };
  }

  const existing: ExistingQuestion[] = await db.question.findMany({
    where: { templateId: template.id, version: template.version },
    orderBy: { orderIndex: "asc" },
    select: {
      id: true,
      orderIndex: true,
      type: true,
      prompt: true,
      hint: true,
      required: true,
      options: true,
      photoMin: true,
      photoMax: true,
      failFlagsIssue: true,
      conditional: true,
    },
  });
  if (existing.length === 0) return { code, skip: "current version has no questions" };

  // Align on the non-divider rows only, in order. If the database already has
  // dividers of its own the alignment still holds and the plan comes out empty.
  const existingBody = existing.filter((q) => !isDivider(q.type));
  const generatedBody = generated.filter((q) => !isDivider(q.type));
  if (existingBody.length !== generatedBody.length) {
    return {
      code,
      skip:
        `REFUSING — ${existingBody.length} non-divider question(s) in the database, ` +
        `${generatedBody.length} in the generated set. Reconcile by hand.`,
    };
  }
  const mismatch = existingBody.findIndex((q, i) => q.prompt !== generatedBody[i]!.prompt);
  if (mismatch !== -1) {
    return {
      code,
      skip:
        `REFUSING — question ${mismatch} does not match. ` +
        `db: ${JSON.stringify(existingBody[mismatch]!.prompt.slice(0, 60))} vs ` +
        `generated: ${JSON.stringify(generatedBody[mismatch]!.prompt.slice(0, 60))}`,
    };
  }

  // Walk the generated set: a divider becomes a brand-new row (no id), a body
  // question echoes the id of the existing row it matched so its hidden fields
  // ride along via buildNextVersionRows.
  const drift: string[] = [];
  const addedDividers: string[] = [];
  const addedHints: { prompt: string; hint: string }[] = [];
  const incoming: IncomingQuestion[] = [];
  let bodyAt = 0;

  for (const g of generated) {
    if (isDivider(g.type)) {
      if (!existing.some((e) => isDivider(e.type) && e.prompt === g.prompt)) {
        addedDividers.push(g.prompt);
      }
      incoming.push({ type: g.type, prompt: g.prompt, required: false, hint: null });
      continue;
    }
    const e = existingBody[bodyAt++]!;
    if (e.type !== g.type) drift.push(`${JSON.stringify(g.prompt.slice(0, 50))} type db=${e.type} generated=${g.type}`);
    if (e.required !== g.required) {
      drift.push(`${JSON.stringify(g.prompt.slice(0, 50))} required db=${e.required} generated=${g.required}`);
    }
    // An explicit hint from the generated set wins; otherwise `undefined` means
    // "carry the row's existing hint", never "clear it".
    const hint = g.hint !== undefined ? g.hint : undefined;
    if (hint !== undefined && hint !== e.hint) addedHints.push({ prompt: g.prompt, hint });
    incoming.push({
      id: e.id,
      // Existing values, not generated ones — see the header. This change adds
      // headers and hints; retyping a field is a separate decision.
      type: e.type,
      prompt: e.prompt,
      required: e.required,
      photoMax: e.photoMax,
      failFlagsIssue: e.failFlagsIssue,
      ...(hint !== undefined ? { hint } : {}),
    });
  }

  const changed = questionSetChanged(existing, incoming);
  const [instances, responses] = await Promise.all([
    db.checklistInstance.count({ where: { templateId: template.id } }),
    db.response.count({ where: { question: { templateId: template.id } } }),
  ]);

  return {
    code,
    name: template.name,
    templateId: template.id,
    currentVersion: template.version,
    nextVersion: changed ? template.version + 1 : template.version,
    instances,
    responses,
    addedDividers,
    addedHints,
    drift,
    incoming,
    existing,
  };
}

async function main() {
  console.log(
    APPLY
      ? "MODE: --apply — this WILL write to the database it is pointed at."
      : "MODE: dry run — nothing is written. Add --apply to execute.",
  );
  console.log(
    "\nAppend-only (ADR-036): no existing question row is updated or deleted, so\n" +
      "no answered question is touched and every existing checklist keeps the\n" +
      "question set it was filled against.",
  );

  const plans: Plan[] = [];
  for (const code of CODES) {
    const p = await planFor(code);
    if ("skip" in p) {
      console.log(`\n${code}: SKIPPED — ${p.skip}`);
      if (p.skip.startsWith("REFUSING")) process.exitCode = 1;
      continue;
    }
    plans.push(p);
  }

  console.log(`\n${"=".repeat(72)}`);
  const todo: Plan[] = [];
  for (const p of plans) {
    const noop = p.nextVersion === p.currentVersion;
    console.log(
      `\n${p.code}  ${p.name}\n` +
        `  version ${p.currentVersion}${noop ? " (unchanged)" : ` -> ${p.nextVersion}`}` +
        `   instances=${p.instances}  responses=${p.responses}`,
    );
    if (noop) {
      console.log("  Already correct — nothing to do.");
      continue;
    }
    todo.push(p);
    console.log(
      `  ${p.existing.length} question(s) at v${p.currentVersion} -> ` +
        `${p.incoming.length} at v${p.nextVersion} (+${p.incoming.length - p.existing.length})`,
    );
    for (const d of p.addedDividers) console.log(`    + SECTION_DIVIDER  ${JSON.stringify(d)}`);
    for (const h of p.addedHints) {
      console.log(`    ~ hint ${JSON.stringify(h.hint)} on ${JSON.stringify(h.prompt.slice(0, 50))}`);
    }
    if (p.drift.length > 0) {
      console.log("    ! DRIFT between database and generated set — REPORTED, NOT CHANGED:");
      for (const d of p.drift) console.log(`        ${d}`);
    }
  }

  if (todo.length === 0) {
    console.log("\nNothing to do.");
    return;
  }
  if (!APPLY) {
    console.log(`\n${todo.length} template(s) would change. Re-run with --apply to write.`);
    return;
  }

  // An audit row per template, so /templates history explains why an instance
  // created yesterday shows a different question set. Falls back to no audit
  // rather than failing the fix if there is no admin to attribute it to.
  const actor = await db.user.findFirst({ where: { role: "ADMIN" }, select: { id: true, email: true } });
  if (!actor) console.log("\n! No ADMIN user found — writing the fix without audit rows.");

  for (const p of todo) {
    await db.$transaction(
      async (tx) => {
        await tx.checklistTemplate.update({
          where: { id: p.templateId },
          data: { version: p.nextVersion },
        });
        await tx.question.createMany({
          data: buildNextVersionRows(p.existing, p.incoming, p.nextVersion).map((r) => ({
            templateId: p.templateId,
            version: r.version,
            orderIndex: r.orderIndex,
            type: r.type,
            prompt: r.prompt,
            hint: r.hint,
            required: r.required,
            options: (r.options ?? undefined) as Prisma.InputJsonValue | undefined,
            photoMin: r.photoMin,
            photoMax: r.photoMax,
            failFlagsIssue: r.failFlagsIssue,
            conditional: (r.conditional ?? undefined) as Prisma.InputJsonValue | undefined,
          })),
        });
        if (actor) {
          await tx.auditLog.create({
            data: {
              actorUserId: actor.id,
              entityType: "template",
              entityId: p.templateId,
              action: "update",
              after: {
                script: "scripts/fix-missing-section-dividers.ts",
                version: p.nextVersion,
                questionsChanged: true,
                addedDividers: p.addedDividers,
                addedHints: p.addedHints.map((h) => `${h.prompt} -> ${h.hint}`),
              },
            },
          });
        }
      },
      // Neon autosuspends, so the first statement pays a cold start, and
      // Prisma's interactive-transaction default is five seconds.
      { timeout: 30_000, maxWait: 30_000 },
    );
    console.log(`  ${p.code}: wrote v${p.nextVersion} (${p.incoming.length} questions)`);
  }

  console.log("\nAfter");
  for (const p of todo) {
    const rows = await db.question.groupBy({
      by: ["version"],
      where: { templateId: p.templateId },
      _count: { _all: true },
      orderBy: { version: "asc" },
    });
    console.log(`  ${p.code.padEnd(5)} ${rows.map((r) => `v${r.version}=${r._count._all}`).join("  ")}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
