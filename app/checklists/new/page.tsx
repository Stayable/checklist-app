import type { Metadata } from "next";
import { requireManager, accessiblePropertyIds } from "@/lib/rbac";
import { getCurrentPropertyId } from "@/lib/current-property";
import { db } from "@/lib/db";
import { etDateOnly } from "@/lib/datetime";
import { nextManualLabelDefault } from "@/lib/manual-create";
import { PageHeader } from "@/components/shell/PageHeader";
import { ManualCreateClient } from "./ManualCreateClient";

export const metadata: Metadata = {
  title: "Create Checklist — StayCheck",
};

// Manual checklist creation (ADR-009 seq, ADR-020 property scope).
// Manager-or-above; English-only management surface (ADR-013).
export default async function NewChecklistPage() {
  const user = await requireManager();
  const accessible = await accessiblePropertyIds(user);
  const activePropertyId = await getCurrentPropertyId(accessible);

  // Templates available at the active property (allProperties=true OR associated).
  const allTemplates = await db.checklistTemplate.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      scope: true,
      allProperties: true,
      properties: { select: { propertyId: true } },
    },
  });

  const templates = allTemplates.filter(
    (t) =>
      t.allProperties ||
      (activePropertyId != null &&
        t.properties.some((p) => p.propertyId === activePropertyId)),
  );

  const today = etDateOnly();
  const defaultTitleFor: Record<string, string> = {};
  for (const t of templates) {
    defaultTitleFor[t.id] = nextManualLabelDefault(t.name, today);
  }

  // Rooms + assignees are property-scoped; empty arrays when no property selected.
  const [rooms, assignees] = activePropertyId
    ? await Promise.all([
        db.room.findMany({
          where: { propertyId: activePropertyId },
          orderBy: { roomNumber: "asc" },
          select: { id: true, roomNumber: true, zone: true },
        }),
        db.user.findMany({
          where: {
            active: true,
            // User.properties is UserProperty[]; filter by propertyId FK.
            properties: { some: { propertyId: activePropertyId } },
          },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
      ])
    : [[], []];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Create a checklist"
        subtitle="Creates one checklist immediately — no recurrence"
      />
      <ManualCreateClient
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          scope: t.scope,
        }))}
        rooms={rooms}
        assignees={assignees}
        activePropertyId={activePropertyId}
        defaultTitleFor={defaultTitleFor}
      />
    </div>
  );
}
