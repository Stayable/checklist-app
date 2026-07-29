import Link from "next/link";
import { requireManager, accessiblePropertyIds } from "@/lib/rbac";
import { getCurrentPropertyId } from "@/lib/current-property";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/shell/PageHeader";
import { NewJobForm } from "./NewJobForm";

// Raise a contractor job (T2). Manager-or-above; the property list is limited to
// what the caller can access, and the action re-checks that server-side.
export default async function NewDispatchJobPage() {
  const user = await requireManager();
  const accessible = await accessiblePropertyIds(user);
  const activeId = await getCurrentPropertyId(accessible);

  const properties = await db.property.findMany({
    where: { id: { in: accessible } },
    orderBy: { shortCode: "asc" },
    select: { id: true, shortCode: true, name: true },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="New contractor job"
        subtitle="What's wrong, where, and how urgent"
        actions={
          <Link
            href="/dispatch"
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            ← Queue
          </Link>
        }
      />
      <NewJobForm properties={properties} defaultPropertyId={activeId ?? properties[0]?.id ?? ""} />
    </div>
  );
}
