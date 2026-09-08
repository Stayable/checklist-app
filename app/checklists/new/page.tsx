import type { Metadata } from "next";
import { Role } from "@prisma/client";
import { requireManager, accessiblePropertyIds } from "@/lib/rbac";
import { getCurrentPropertyId } from "@/lib/current-property";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/shell/PageHeader";
import { BatchCreateClient } from "./BatchCreateClient";

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
      copies: true,
      defaultRole: true,
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

  const propertyShortCode = activePropertyId
    ? ((
        await db.property.findUnique({
          where: { id: activePropertyId },
          select: { shortCode: true },
        })
      )?.shortCode ?? "")
    : "";


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
            // On-site personnel only (Kyle, 2026-09-09) — the people who
            // actually work here. Field staff plus the on-site Property
            // Managers; excludes the 3 remote PMs, CORPORATE, ADMIN and the
            // AGENT night-audit reviewers. Expressed as the SQL equivalent of
            // isOnSiteAssignable so the filter runs in the query rather than
            // fetching the whole roster and discarding most of it.
            OR: [
              { role: { in: [Role.HK, Role.PA, Role.MT] } },
              { role: Role.MANAGER, remote: false },
            ],
          },
          orderBy: { name: "asc" },
          select: { id: true, name: true, role: true },
        }),
      ])
    : [[], []];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Create a checklist"
        subtitle="Build one or more batches, preview the names, then create"
      />
      <BatchCreateClient
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          scope: t.scope,
          copies: t.copies,
          defaultRole: t.defaultRole,
        }))}
        rooms={rooms}
        assignees={assignees}
        activePropertyId={activePropertyId}
        propertyShortCode={propertyShortCode}
      />
    </div>
  );
}
