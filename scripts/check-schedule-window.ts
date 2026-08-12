/**
 * Read-only: which days currently have contractor jobs on the calendar?
 *
 * Run: pnpm dotenv -e .env.production.local -- tsx scripts/check-schedule-window.ts
 *
 * Matters because a crew update can only land ON a job. The fan-out never
 * creates one (contract §7), so a day with no jobs turns every update for that
 * day into a ContractorDailyNote — and the calendar looks untouched, which is
 * indistinguishable from nothing having been sent. Writes nothing.
 */
import { db } from "../lib/db";

async function main() {
  const days = await db.contractorJob.groupBy({
    by: ["scheduledFor"],
    _count: { _all: true },
    orderBy: { scheduledFor: "desc" },
    take: 12,
  });

  console.log("jobs per scheduled day (most recent first):");
  for (const d of days) {
    const ymd = d.scheduledFor ? d.scheduledFor.toISOString().slice(0, 10) : "unscheduled backlog";
    console.log(`  ${ymd.padEnd(22)} ${d._count._all}`);
  }

  const unassigned = await db.contractorJob.count({ where: { contractorId: null } });
  console.log(`\njobs with no contractor assigned: ${unassigned}`);
  console.log("(an unassigned job cannot receive an update — resolution is by contractor)");

  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
