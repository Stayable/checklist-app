import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { InstanceStatus } from "@prisma/client";
import { InstallPrompt } from "@/components/InstallPrompt";
import { LocalePrompt } from "@/components/LocalePrompt";
import { PageHeader } from "@/components/shell/PageHeader";
import {
  isAdmin,
  requireUser,
} from "@/lib/rbac";
import { db } from "@/lib/db";
import { etDateOnly, formatDateInET } from "@/lib/datetime";

// Authed home. Field staff see today's assignments ("Today"); admins get a
// console link; managers get a review link. Route protection via requireUser().
export default async function Home() {
  const user = await requireUser();
  const t = await getTranslations("Home");

  // Today's assignments (ET-anchored, ADR-013) for whoever is assigned.
  const today = etDateOnly();
  const assignments = await db.checklistInstance.findMany({
    where: {
      assignedUserId: user.id,
      scheduledFor: today,
      status: {
        in: [
          InstanceStatus.SCHEDULED,
          InstanceStatus.ASSIGNED,
          InstanceStatus.IN_PROGRESS,
          InstanceStatus.SUBMITTED,
          InstanceStatus.FLAGGED,
        ],
      },
    },
    orderBy: { systemId: "asc" },
    select: {
      id: true,
      status: true,
      template: { select: { name: true } },
      property: { select: { shortCode: true } },
      room: { select: { roomNumber: true } },
    },
  });

  const isDone = (s: InstanceStatus) =>
    s === InstanceStatus.SUBMITTED || s === InstanceStatus.REVIEWED;

  const doneCount = assignments.filter((a) => isDone(a.status)).length;
  const total = assignments.length;
  const pct = total === 0 ? 0 : Math.round((doneCount / total) * 100);

  // Status pill treatment (shared shape, Connecteam-familiar chips).
  const pill = (s: InstanceStatus) => {
    if (isDone(s)) return "bg-emerald-50 text-emerald-700";
    if (s === InstanceStatus.FLAGGED) return "bg-red-50 text-red-700";
    if (s === InstanceStatus.IN_PROGRESS) return "bg-blue-50 text-blue-700";
    return "bg-slate-100 text-slate-600";
  };

  return (
    <>
      <PageHeader
        title={t("greeting", { name: user.name })}
        subtitle={formatDateInET(today)}
      />

      <LocalePrompt role={user.role} />

      {/* Progress summary card */}
      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-bold uppercase tracking-wide text-slate-500">
            {t("today")}
          </span>
          <span className="text-sm font-semibold text-slate-900">
            {doneCount}/{total}
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {isAdmin(user.role) && (
        <div className="pt-4">
          <Link
            href="/admin/users"
            className="block rounded-xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Admin console →
          </Link>
        </div>
      )}

      <section className="pt-5">
        {total === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
            {t("noAssignments")}
          </div>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {assignments.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/checklists/${a.id}`}
                  className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 transition active:scale-[0.99] hover:bg-slate-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-slate-900">
                      {a.template.name}
                    </span>
                    <span className="text-xs text-slate-500">
                      {a.property.shortCode}
                      {a.room ? ` · Rm ${a.room.roomNumber}` : ""}
                    </span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${pill(a.status)}`}>
                    {t(`status_${a.status}` as never)}
                  </span>
                  <svg className="h-5 w-5 shrink-0 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="pt-5">
        <InstallPrompt />
      </div>
    </>
  );
}
