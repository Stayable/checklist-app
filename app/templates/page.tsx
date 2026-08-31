import Link from "next/link";
import { requireManager, accessiblePropertyIds } from "@/lib/rbac";
import { getCurrentPropertyId } from "@/lib/current-property";
import { resolveScopedPropertyIds } from "@/lib/property-scope";
import { canManageTemplate } from "@/lib/template-access";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/shell/PageHeader";
import { TemplatesClient } from "./TemplatesClient";

export default async function TemplatesPage() {
  const user = await requireManager();
  const accessible = await accessiblePropertyIds(user);
  const activeId = await getCurrentPropertyId(accessible);
  const scopedIds = resolveScopedPropertyIds(accessible, activeId);

  const templates = await db.checklistTemplate.findMany({
    // Active templates, plus the W2 drafts — seeded `active: false` with zero
    // questions and waiting for Kyle to author them. `questions: { none: {} }`
    // is what separates a draft from a RETIRED template: a retired one (HKR /
    // PAR / MGR) still carries its question set, so it stays out of this list.
    where: { OR: [{ active: true }, { questions: { none: {} } }] },
    orderBy: { name: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      scope: true,
      defaultRole: true,
      reviewLevel: true,
      allProperties: true,
      properties: { select: { propertyId: true } },
      _count: { select: { questions: true, instances: true } },
    },
  });

  const scopedSet = new Set(scopedIds);
  const rows = templates
    .map((t) => {
      const propertyIds = t.properties.map((p) => p.propertyId);
      return {
        id: t.id,
        code: t.code,
        name: t.name,
        scope: t.scope,
        allProperties: t.allProperties,
        propertyIds,
        questionCount: t._count.questions,
        instanceCount: t._count.instances,
        canManage: canManageTemplate(user.role, accessible, { allProperties: t.allProperties, propertyIds }),
        appliesHere: propertyIds.some((id) => scopedSet.has(id)) || t.allProperties,
      };
    })
    // Show templates that apply to the active scope (All-properties always show).
    .filter((t) => activeId == null || t.appliesHere);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Checklist templates"
        subtitle={`${rows.length} template${rows.length === 1 ? "" : "s"} for the current scope`}
        actions={
          <Link
            href="/templates/new"
            className="rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            New template
          </Link>
        }
      />
      <TemplatesClient rows={rows} />
    </div>
  );
}
