/**
 * Read-only: which address would a review notification actually reach?
 *
 * The flag / fail email goes to `ChecklistInstance.assignedUser.email`, not to
 * whatever address a person happens to read. Worth confirming before using a
 * live flag as the template test, so the message does not land somewhere
 * nobody is watching.
 */
import { db } from "../lib/db";

async function main() {
  const users = await db.user.findMany({
    where: { OR: [{ email: { contains: "bke" } }, { name: { contains: "Kyle" } }] },
    select: {
      email: true,
      name: true,
      role: true,
      locale: true,
      active: true,
      alwaysAssignable: true,
    },
    orderBy: { email: "asc" },
  });
  console.table(users);

  // Anything already assigned to those accounts that could carry the test.
  const emails = users.map((u) => u.email);
  const assigned = await db.checklistInstance.groupBy({
    by: ["status"],
    where: { assignedUser: { email: { in: emails } } },
    _count: { _all: true },
  });
  console.log("instances assigned to those accounts, by status:");
  console.table(assigned.map((a) => ({ status: a.status, count: a._count._all })));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
