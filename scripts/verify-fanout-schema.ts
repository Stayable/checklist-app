/**
 * Read-only: did the fan-out migration land as intended?
 *
 * Run: pnpm dotenv -e .env.production.local -- tsx scripts/verify-fanout-schema.ts
 *
 * Checks the three things the migration claims and nothing else: the DELAYED
 * enum value exists in the right position, both new tables exist, and the
 * messageSid unique index exists (it is the idempotency guarantee — without it
 * a retried Twilio delivery would be applied twice). Writes nothing.
 */
import { db } from "../lib/db";

async function main() {
  const enumValues = await db.$queryRawUnsafe<{ label: string; sortorder: number }[]>(
    `SELECT e.enumlabel AS label, e.enumsortorder AS sortorder
       FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'ContractorJobStatus'
      ORDER BY e.enumsortorder`,
  );
  console.log(`ContractorJobStatus: ${enumValues.map((v) => v.label).join(" -> ")}`);
  console.log(`  DELAYED present: ${enumValues.some((v) => v.label === "DELAYED")}`);

  const tables = await db.$queryRawUnsafe<{ table_name: string }[]>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('contractor_updates', 'contractor_update_captures')
      ORDER BY table_name`,
  );
  console.log(`new tables: ${tables.map((t) => t.table_name).join(", ") || "NONE"}`);

  const indexes = await db.$queryRawUnsafe<{ indexname: string; indexdef: string }[]>(
    `SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'contractor_updates'
      ORDER BY indexname`,
  );
  const unique = indexes.find((i) => i.indexdef.includes("UNIQUE") && i.indexdef.includes("message_sid"));
  console.log(`message_sid UNIQUE index: ${unique ? unique.indexname : "MISSING"}`);

  // Nothing should exist yet — the receiver has never been called.
  console.log(`\ncontractor_updates rows:          ${await db.contractorUpdate.count()}`);
  console.log(`contractor_update_captures rows: ${await db.contractorUpdateCapture.count()}`);

  const jobs = await db.contractorJob.groupBy({ by: ["status"], _count: { _all: true } });
  console.log(`jobs by status: ${jobs.map((j) => `${j.status}=${j._count._all}`).join(" ")}`);

  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
