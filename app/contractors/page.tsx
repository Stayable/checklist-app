import { requireManager, accessiblePropertyIds, isPortfolioRole } from "@/lib/rbac";
import { getCurrentPropertyId } from "@/lib/current-property";
import { resolveScopedPropertyIds } from "@/lib/property-scope";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/shell/PageHeader";
import { ContractorsClient } from "./ContractorsClient";

// Contractors directory (Component II — Contractor Dispatch MVP, ADR-025).
// Manager-or-above. Property-scoped: scoped managers see contractors covering
// their accessible properties; the header picker narrows to the active property.
export default async function ContractorsPage() {
  const user = await requireManager();
  const accessible = await accessiblePropertyIds(user);
  const activeId = await getCurrentPropertyId(accessible);
  const scopedIds = resolveScopedPropertyIds(accessible, activeId);

  const [contractors, properties] = await Promise.all([
    db.contractor.findMany({
      where: { properties: { some: { propertyId: { in: scopedIds } } } },
      // Active first, then contracted (call-first) contractors, then by name.
      orderBy: [{ active: "desc" }, { contracted: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        company: true,
        trades: true,
        whatsapp: true,
        phone: true,
        language: true,
        contracted: true,
        onCall: true,
        active: true,
        notes: true,
        userId: true,
        properties: { select: { propertyId: true } },
      },
    }),
    db.property.findMany({
      where: { id: { in: accessible } },
      orderBy: { shortCode: "asc" },
      select: { id: true, shortCode: true, name: true },
    }),
  ]);

  const rows = contractors.map((c) => ({
    id: c.id,
    name: c.name,
    company: c.company,
    trades: c.trades,
    whatsapp: c.whatsapp,
    phone: c.phone,
    language: c.language,
    contracted: c.contracted,
    onCall: c.onCall,
    active: c.active,
    notes: c.notes,
    isStaff: c.userId !== null,
    propertyIds: c.properties.map((p) => p.propertyId),
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Contractors"
        subtitle={`${rows.length} contractor${rows.length === 1 ? "" : "s"} for the current scope`}
      />
      <ContractorsClient
        rows={rows}
        properties={properties}
        canAssignAll={isPortfolioRole(user.role)}
      />
    </div>
  );
}
