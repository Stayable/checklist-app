import { IssuePriority } from "@prisma/client";
import { db } from "@/lib/db";
import { SLA_PLACEHOLDER_HOURS } from "@/lib/review";
import { SlaForm } from "./SlaForm";

// Admin SLA defaults (Phase 4). Layout already guards ADMIN.

export default async function SlaPage() {
  const rows = await db.slaDefault.findMany();
  const byPriority = Object.fromEntries(rows.map((r) => [r.priority, r.hours]));

  const values = Object.fromEntries(
    Object.values(IssuePriority).map((p) => [p, byPriority[p] ?? SLA_PLACEHOLDER_HOURS[p]]),
  ) as Record<IssuePriority, number>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">SLA defaults</h1>
        <p className="text-sm text-slate-500">
          Hours from issue creation to its SLA target, per priority. Applies to new issues
          only. Placeholder values pending Christopher&apos;s confirmation (ADR-014).
        </p>
      </div>
      <SlaForm initial={values} seeded={rows.length > 0} />
    </div>
  );
}
