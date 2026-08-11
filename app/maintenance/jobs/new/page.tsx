import Link from "next/link";
import { accessibleProperties, requireMaintenanceAccess } from "@/lib/rbac";
import { getCurrentPropertyId } from "@/lib/current-property";
import { parseDateParam } from "@/lib/contractor-schedule";
import { PageHeader } from "@/components/shell/PageHeader";
import { NewJobForm } from "./NewJobForm";

// New contractor job. One create path for the whole feature — a day cell on
// the calendar links here with ?scheduledFor= prefilled rather than carrying
// its own inline create form and its own copy of the validation.

export default async function NewJobPage({
  searchParams,
}: {
  searchParams: Promise<{ scheduledFor?: string }>;
}) {
  const user = await requireMaintenanceAccess();
  const properties = await accessibleProperties(user);
  const activeId = await getCurrentPropertyId(properties.map((p) => p.id));

  // parseDateParam falls back to TODAY for an absent value, which would be
  // wrong here: no date must mean the unscheduled backlog, not today. So it
  // is only consulted when the param is actually present (it still
  // normalizes a compact "20260811" and rejects an impossible date).
  const raw = (await searchParams).scheduledFor;
  const prefillDate = raw ? parseDateParam(raw) : "";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/maintenance/schedule" className="text-sm text-slate-500 hover:underline">
          ← Schedule
        </Link>
      </div>
      <PageHeader
        title="New contractor job"
        subtitle="Schedule contractor work, or leave the date blank to add it to the unscheduled backlog."
      />
      {properties.length === 0 ? (
        <p className="text-sm text-slate-600">
          You have no properties assigned, so there is nothing to schedule work against.
        </p>
      ) : (
        <NewJobForm
          properties={properties}
          defaultPropertyId={activeId ?? properties[0].id}
          defaultScheduledFor={prefillDate}
        />
      )}
    </div>
  );
}
