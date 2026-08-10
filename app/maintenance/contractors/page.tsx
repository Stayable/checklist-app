import { accessibleProperties, requireManager } from "@/lib/rbac";
import { getCurrentPropertyId } from "@/lib/current-property";
import { resolveScopedPropertyIds } from "@/lib/property-scope";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/shell/PageHeader";
import { ContractorsClient } from "./ContractorsClient";

export default async function ContractorsPage() {
  const user = await requireManager();
  const properties = await accessibleProperties(user);
  const accessible = properties.map((p) => p.id);
  const activeId = await getCurrentPropertyId(accessible);
  const scopedIds = resolveScopedPropertyIds(accessible, activeId);

  const contractors = await db.contractor.findMany({
    where: { properties: { some: { propertyId: { in: scopedIds } } } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      company: true,
      trades: true,
      phone: true,
      whatsapp: true,
      active: true,
      properties: {
        select: { propertyId: true, property: { select: { shortCode: true } } },
      },
    },
  });

  const rows = contractors.map((c) => ({
    id: c.id,
    name: c.name,
    company: c.company,
    trades: c.trades,
    phone: c.phone,
    whatsapp: c.whatsapp,
    active: c.active,
    propertyIds: c.properties.map((p) => p.propertyId),
    propertyShortCodes: c.properties.map((p) => p.property.shortCode),
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Contractors"
        subtitle={`${rows.length} contractor${rows.length === 1 ? "" : "s"} for the current scope`}
      />
      <ContractorsClient rows={rows} properties={properties} />
    </div>
  );
}
