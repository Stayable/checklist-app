import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { InstanceStatus } from "@prisma/client";
import { SignOutButton } from "@/components/SignOutButton";
import { OnlineStatus } from "@/components/OnlineStatus";
import { InstallPrompt } from "@/components/InstallPrompt";
import { PropertyPicker } from "@/components/PropertyPicker";
import { LocalePrompt } from "@/components/LocalePrompt";
import {
  accessibleProperties,
  isAdmin,
  isManagerOrAbove,
  isPortfolioRole,
  requireUser,
} from "@/lib/rbac";
import { getCurrentPropertyId } from "@/lib/current-property";
import { db } from "@/lib/db";
import { etDateOnly, formatDateInET } from "@/lib/datetime";

// Authed home. Field staff see today's assignments ("Today"); admins get a
// console link; managers get a review link. Route protection via requireUser().
export default async function Home() {
  const user = await requireUser();
  const t = await getTranslations("Home");

  const properties = await accessibleProperties(user);
  const showPicker = !isPortfolioRole(user.role) && properties.length > 1;
  const currentPropertyId = showPicker
    ? await getCurrentPropertyId(properties.map((p) => p.id))
    : null;

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

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 p-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("greeting", { name: user.name })}</h1>
          <p className="text-sm text-slate-500">
            {t("role")}: {user.role}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <OnlineStatus />
          {showPicker && <PropertyPicker properties={properties} current={currentPropertyId} />}
          <SignOutButton />
        </div>
      </header>

      <LocalePrompt role={user.role} />

      {isAdmin(user.role) && (
        <Link
          href="/admin/users"
          className="rounded-xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Admin console →
        </Link>
      )}

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
          {t("today")} · {formatDateInET(today)}
        </h2>
        {assignments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
            {t("noAssignments")}
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {assignments.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/checklists/${a.id}`}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 hover:bg-slate-50"
                >
                  <span>
                    <span className="block font-semibold text-slate-900">{a.template.name}</span>
                    <span className="text-xs text-slate-500">
                      {a.property.shortCode}
                      {a.room ? ` · Rm ${a.room.roomNumber}` : ""}
                    </span>
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      isDone(a.status)
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {t(`status_${a.status}` as never)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isManagerOrAbove(user.role) && (
        // Manager surface — English-only in v1 (ADR-013).
        <div className="flex flex-col gap-2">
          <Link
            href="/review"
            className="rounded-xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Review queue →
          </Link>
          <Link
            href="/issues"
            className="rounded-xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Issues →
          </Link>
        </div>
      )}

      <InstallPrompt />
    </main>
  );
}
