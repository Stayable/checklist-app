/**
 * Replace the placeholder question sets on the six original templates with the
 * real ones extracted from Connecteam, and clear the test-round checklist
 * instances that reference them.
 *
 * Run (dry run, prints and writes nothing):
 *   pnpm dotenv -e .env.production.local -- tsx scripts/reset-template-questions.ts
 * Run for real:
 *   pnpm dotenv -e .env.production.local -- tsx scripts/reset-template-questions.ts --apply
 *
 * WHY THIS EXISTS
 * The seed writes questions only to a template that has NONE — the guard that
 * stops a re-run wiping authored content. On production ARR / DEP / MNT / PWR /
 * RPM / RIN already carry the development placeholders, so the seed skips them
 * and leaves the six most-used templates on fake questions.
 *
 * ORDER MATTERS AND IS NOT INTERCHANGEABLE
 * `Response.question` is a REQUIRED relation with no cascade, so a question with
 * responses cannot be deleted. `Response.instance` IS `onDelete: Cascade`, and
 * `Photo.response` likewise. So instances must go first; that removes the
 * responses; only then are the questions deletable. Reversing the order fails
 * with a foreign-key error rather than corrupting anything, but it fails.
 *
 * `Issue.sourceQuestion` is OPTIONAL, so an issue raised by a deleted question
 * survives with a null source rather than blocking the delete. Those issues are
 * reported before deleting, because losing the link is a real loss of context.
 *
 * IT ALSO RENAMES AND UNPUBLISHES THEM
 * These six are the only templates that reach production already published, so
 * without this they would be the only six whose question set changes with NO
 * review step -- swapped underneath whoever is mid-shift. Kyle's call: after the
 * real content lands they go back to being drafts, and a Property Manager
 * reviews and publishes them like every other template.
 *
 * The name comes from CONNECTEAM_NAMES, i.e. what the people filling the form
 * in already call it. Several seeded names were inherited from Smartsheet SHEET
 * names that match no Connecteam form at all.
 *
 * `code` is NEVER touched. ADR-009 bakes it into every system ID and PDF
 * filename already issued.
 *
 * ⚠ R2 OBJECTS ARE NOT DELETED. Removing a Photo row orphans its R2 object.
 * That is deliberate: the platform policy is keep-photos-forever (ADR-013) and
 * this script must not be the thing that starts deleting from object storage.
 * The orphans are test-round images and cost cents.
 */
import { PrismaClient } from "@prisma/client";

import {
  CONNECTEAM_NAMES,
  CONNECTEAM_QUESTIONS,
} from "../prisma/data/connecteam-questions";

const db = new PrismaClient();

/** The six carrying development placeholders on production. */
const CODES = ["ARR", "DEP", "MNT", "PWR", "RPM", "RIN"] as const;

const APPLY = process.argv.includes("--apply");

function heading(text: string) {
  console.log(`\n${text}\n${"-".repeat(text.length)}`);
}

async function main() {
  console.log(
    APPLY
      ? "MODE: --apply — this WILL delete production rows."
      : "MODE: dry run — nothing is written. Add --apply to execute.",
  );

  // ---- 1. inventory, before anything is touched ---------------------------
  heading("Templates in scope");
  const templates = await db.checklistTemplate.findMany({
    where: { code: { in: [...CODES] } },
    select: {
      id: true,
      code: true,
      name: true,
      _count: { select: { questions: true, instances: true } },
    },
    orderBy: { code: "asc" },
  });

  const missing = CODES.filter((c) => !templates.some((t) => t.code === c));
  if (missing.length > 0) {
    console.log(`  ! not present in this database: ${missing.join(", ")}`);
  }

  let plannedQuestionDeletes = 0;
  for (const t of templates) {
    const incoming = CONNECTEAM_QUESTIONS[t.code]?.length ?? 0;
    plannedQuestionDeletes += t._count.questions;
    const realName = CONNECTEAM_NAMES[t.code];
    console.log(
      `  ${t.code.padEnd(5)} ${String(t._count.questions).padStart(3)} placeholder -> ${String(incoming).padStart(3)} extracted   (${t._count.instances} instances)`,
    );
    if (realName && realName !== t.name) {
      console.log(`        rename: "${t.name}" -> "${realName}"`);
    }
    console.log(`        unpublish -> Draft (filled), awaiting PM review`);
    if (incoming === 0) {
      console.log(
        `        ! no extracted set for ${t.code}; its questions would be deleted and NOT replaced.`,
      );
    }
  }

  // ---- 2. every instance, because they are all test-round data ------------
  heading("Checklist instances (all of them — test-round data)");
  const instances = await db.checklistInstance.findMany({
    select: {
      id: true,
      systemId: true,
      title: true,
      status: true,
      createdAt: true,
      template: { select: { code: true } },
      _count: { select: { responses: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  if (instances.length === 0) {
    console.log("  (none)");
  }
  for (const i of instances) {
    console.log(
      `  ${(i.systemId ?? i.id).padEnd(26)} ${i.template.code.padEnd(5)} ${i.status.padEnd(12)} ${i._count.responses} responses  ${i.title ?? ""}`,
    );
  }

  const photoCount = await db.photo.count({
    where: { response: { isNot: null } },
  });
  const responseCount = await db.response.count();
  console.log(`\n  responses: ${responseCount}   photos hanging off responses: ${photoCount}`);
  if (photoCount > 0) {
    console.log("  ⚠ deleting these Photo rows ORPHANS their R2 objects — see the file header.");
  }

  // ---- 3. issues that would lose their source question --------------------
  const orphanedIssues = await db.issue.count({
    where: { sourceQuestion: { template: { code: { in: [...CODES] } } } },
  });
  if (orphanedIssues > 0) {
    heading("Issues");
    console.log(
      `  ${orphanedIssues} issue(s) point at a question being deleted. They SURVIVE, but`,
    );
    console.log("  their sourceQuestionId becomes null — the link to what raised them is lost.");
  }

  heading("Plan");
  console.log(`  delete ${instances.length} checklist instance(s)  (cascades responses + photos)`);
  console.log(`  delete ${plannedQuestionDeletes} placeholder question(s) across ${templates.length} template(s)`);
  console.log(
    `  create ${CODES.reduce((n, c) => n + (CONNECTEAM_QUESTIONS[c]?.length ?? 0), 0)} extracted question(s)`,
  );

  if (!APPLY) {
    console.log("\nDry run complete. Re-run with --apply to execute.");
    return;
  }

  // ---- 4. execute --------------------------------------------------------
  //
  // One transaction. Unlike the checklist create path (where a P2002 retry must
  // not be poisoned by a transaction), there is no retry here and a partial
  // apply is the worst outcome: instances gone but questions still fake, or
  // questions deleted and not replaced.
  heading("Applying");
  const result = await db.$transaction(async (tx) => {
    const deletedInstances = await tx.checklistInstance.deleteMany({});

    let deletedQuestions = 0;
    let createdQuestions = 0;
    for (const t of templates) {
      const incoming = CONNECTEAM_QUESTIONS[t.code] ?? [];
      // Back to a draft, under its real Connecteam name. publishedAt is cleared
      // as well as active: publishedAt set + inactive means RETIRED, and these
      // are the opposite of retired — they are awaiting a first review.
      await tx.checklistTemplate.update({
        where: { id: t.id },
        data: {
          name: CONNECTEAM_NAMES[t.code] ?? undefined,
          active: false,
          publishedAt: null,
        },
      });

      const del = await tx.question.deleteMany({ where: { templateId: t.id } });
      deletedQuestions += del.count;
      if (incoming.length > 0) {
        const made = await tx.question.createMany({
          data: incoming.map((q) => ({
            templateId: t.id,
            orderIndex: q.orderIndex,
            type: q.type,
            prompt: q.prompt,
            hint: q.hint ?? null,
            required: q.required,
          })),
        });
        createdQuestions += made.count;
      }
    }
    return { deletedInstances: deletedInstances.count, deletedQuestions, createdQuestions };
  });

  console.log(`  instances deleted: ${result.deletedInstances}`);
  console.log(`  questions deleted: ${result.deletedQuestions}`);
  console.log(`  questions created: ${result.createdQuestions}`);

  heading("After");
  const after = await db.checklistTemplate.findMany({
    where: { code: { in: [...CODES] } },
    select: {
      code: true,
      name: true,
      active: true,
      publishedAt: true,
      _count: { select: { questions: true } },
    },
    orderBy: { code: "asc" },
  });
  for (const t of after) {
    const state = t.publishedAt == null ? "Draft (filled)" : t.active ? "Published" : "Retired";
    console.log(
      `  ${t.code.padEnd(5)} ${String(t._count.questions).padStart(3)} questions  ${state.padEnd(15)} ${t.name}`,
    );
  }
  console.log(`  checklist instances remaining: ${await db.checklistInstance.count()}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
