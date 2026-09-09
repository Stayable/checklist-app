/**
 * Delete a checklist instance that was created as scaffolding.
 *
 * Run: pnpm dotenv -e .env.production.local -- tsx scripts/delete-test-checklist.ts <id> [--apply]
 *
 * REFUSES to delete anything that carries real work — any response, or a
 * submittedAt. Scaffolding is cheap to recreate; somebody's filled checklist is
 * not, and the difference is one flag away from being indistinguishable at 2am.
 */
import { db } from "../lib/db";

async function main() {
  const id = process.argv[2];
  const apply = process.argv.includes("--apply");
  if (!id) {
    console.error("usage: delete-test-checklist.ts <instanceId> [--apply]");
    process.exit(1);
  }

  const inst = await db.checklistInstance.findUnique({
    where: { id },
    select: {
      systemId: true,
      title: true,
      status: true,
      openedAt: true,
      submittedAt: true,
      assignedUser: { select: { email: true } },
      _count: { select: { responses: true } },
    },
  });

  if (!inst) {
    console.log(`No instance ${id} — already gone.`);
    return;
  }

  console.log(`systemId   ${inst.systemId}`);
  console.log(`title      ${inst.title}`);
  console.log(`status     ${inst.status}`);
  console.log(`assignee   ${inst.assignedUser?.email ?? "(unassigned)"}`);
  console.log(`opened     ${inst.openedAt?.toISOString() ?? "never"}`);
  console.log(`submitted  ${inst.submittedAt?.toISOString() ?? "never"}`);
  console.log(`responses  ${inst._count.responses}`);

  if (inst._count.responses > 0 || inst.submittedAt) {
    console.error("\nREFUSING: this carries real work (responses or a submission).");
    process.exit(1);
  }

  if (!apply) {
    console.log("\ndry run — nothing deleted. Re-run with --apply.");
    return;
  }

  await db.checklistInstance.delete({ where: { id } });
  console.log(`\ndeleted ${id}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
