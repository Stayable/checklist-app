/**
 * Read-only: does the contractor roster carry the identity the fan-out contract
 * (docs/ContractorUpdateFanout_Contract_081226.md §7) resolves on?
 *
 * Run: pnpm dotenv -e .env.production.local -- tsx scripts/check-contractor-identity.ts
 *
 * Writes nothing.
 */
import { db } from "../lib/db";

async function main() {
  const contractors = await db.contractor.findMany({
    select: { name: true, phone: true, whatsapp: true, active: true },
    orderBy: { name: "asc" },
  });

  const withPhone = contractors.filter((c) => c.phone).length;
  const withWhatsapp = contractors.filter((c) => c.whatsapp).length;

  console.log(`contractors: ${contractors.length}`);
  console.log(`  with phone:    ${withPhone}`);
  console.log(`  with whatsapp: ${withWhatsapp}`);
  for (const c of contractors) {
    console.log(`  ${c.name.padEnd(30)} phone=${c.phone ?? "—"}  wa=${c.whatsapp ?? "—"}`);
  }

  const byStatus = await db.contractorJob.groupBy({ by: ["status"], _count: { _all: true } });
  console.log(`\njobs by status: ${byStatus.map((s) => `${s.status}=${s._count._all}`).join(" ")}`);
  console.log(`jobs unassigned: ${await db.contractorJob.count({ where: { contractorId: null } })}`);

  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
