import type { Metadata } from "next";
import { Role } from "@prisma/client";
import { accessibleProperties, accessiblePropertyIds, requireManager } from "@/lib/rbac";
import { db } from "@/lib/db";
import { RulesManager, type RuleRow } from "./RulesManager";
import type { RecurrencePattern, RoomFilter } from "@/lib/recurrence";

export const metadata: Metadata = {
  title: "Recurring Rules — Stayable Operations",
};

// Recurring-rule management (ADR-009, Phase 5). Manager-or-above; scoped to the
// user's accessible properties. English-only (ADR-013) — management surface.
export default async function RulesPage() {
  const user = await requireManager();
  const propertyIds = await accessiblePropertyIds(user);
  const properties = await accessibleProperties(user);

  const [templates, rules, members] = await Promise.all([
    db.checklistTemplate.findMany({
      where: { active: true },
      select: { id: true, code: true, name: true, scope: true, defaultRole: true },
      orderBy: { name: "asc" },
    }),
    db.recurringRule.findMany({
      where: { propertyId: { in: propertyIds } },
      include: {
        template: { select: { name: true, code: true, scope: true } },
        property: { select: { shortCode: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    // Assignable users per accessible property (field + manager roles), for the
    // "specific user" assignment option.
    db.userProperty.findMany({
      where: {
        propertyId: { in: propertyIds },
        user: { active: true, role: { in: [Role.HK, Role.PA, Role.MT, Role.MANAGER] } },
      },
      select: {
        propertyId: true,
        user: { select: { id: true, name: true, role: true } },
      },
    }),
  ]);

  const ruleRows: RuleRow[] = rules.map((r) => ({
    id: r.id,
    templateName: r.template.name,
    templateCode: r.template.code,
    isPerRoom: r.template.scope === "PER_ROOM",
    shortCode: r.property.shortCode,
    pattern: r.pattern as RecurrencePattern,
    scope: (r.scope as RoomFilter | null) ?? null,
    assignment: r.assignment as RuleRow["assignment"],
    active: r.active,
    effectiveFrom: r.effectiveFrom ? r.effectiveFrom.toISOString().slice(0, 10) : null,
    effectiveTo: r.effectiveTo ? r.effectiveTo.toISOString().slice(0, 10) : null,
  }));

  const usersByProperty: Record<string, { id: string; name: string; role: Role }[]> = {};
  for (const m of members) {
    (usersByProperty[m.propertyId] ??= []).push(m.user);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 pb-24">
      <header className="mb-5">
        <h1 className="text-xl font-bold text-navy">Recurring Rules</h1>
        <p className="text-sm text-slate-500">
          Auto-generate checklists on a schedule. Instances are created daily at 5:00 AM ET.
        </p>
      </header>
      <RulesManager
        properties={properties}
        templates={templates}
        rules={ruleRows}
        usersByProperty={usersByProperty}
      />
    </div>
  );
}
