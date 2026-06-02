import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { IssueStatus, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { canAccessProperty, requireManager } from "@/lib/rbac";
import { formatInET } from "@/lib/datetime";
import { isSlaBreached } from "@/lib/review";
import { IssueDetailClient } from "./IssueDetailClient";

// Issue detail (Phase 4): metadata + source links + assign / status / priority
// controls + resolution flow (note required; photo requirement is R2-gated).

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireManager();
  const { id } = await params;

  const issue = await db.issue.findUnique({
    where: { id },
    include: {
      property: { select: { id: true, shortCode: true, name: true } },
      room: { select: { roomNumber: true } },
      assignedUser: { select: { id: true, name: true } },
      sourceInstance: { select: { id: true, systemId: true } },
      sourceQuestion: { select: { prompt: true } },
    },
  });
  if (!issue) notFound();
  if (!(await canAccessProperty(user, issue.propertyId))) redirect("/issues");

  // Assignable users: active staff at this property (any role) — typically MT.
  const assignees = await db.user.findMany({
    where: {
      active: true,
      OR: [
        { role: { in: [Role.CORPORATE, Role.ADMIN] } },
        { properties: { some: { propertyId: issue.propertyId } } },
      ],
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, role: true },
  });

  const timeline = await db.auditLog.findMany({
    where: { entityType: "issue", entityId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, action: true, createdAt: true, actor: { select: { name: true } } },
  });

  const closed = issue.status === IssueStatus.RESOLVED || issue.status === IssueStatus.WONT_FIX;
  const breached = isSlaBreached(issue.slaTargetAt, issue.resolvedAt, new Date());

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6">
      <header>
        <Link href="/issues" className="text-sm text-slate-500 hover:underline">
          ← Issues
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">{issue.title}</h1>
        <p className="text-sm text-slate-500">
          {issue.property.shortCode}
          {issue.room ? ` · Rm ${issue.room.roomNumber}` : ""} · created{" "}
          {formatInET(issue.createdAt)}
          {issue.slaTargetAt && (
            <>
              {" · SLA "}
              <span className={breached ? "font-bold text-red-600" : ""}>
                {formatInET(issue.slaTargetAt)}
                {breached ? " (BREACHED)" : ""}
              </span>
            </>
          )}
        </p>
      </header>

      {issue.description && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
            Description
          </h2>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{issue.description}</p>
        </div>
      )}

      {issue.sourceInstance && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <h2 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Source</h2>
          <Link
            href={`/review/${issue.sourceInstance.id}`}
            className="font-semibold text-slate-900 hover:underline"
          >
            {issue.sourceInstance.systemId ?? issue.sourceInstance.id}
          </Link>
          {issue.sourceQuestion && (
            <p className="mt-1 text-slate-500">Question: {issue.sourceQuestion.prompt}</p>
          )}
        </div>
      )}

      {closed ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <h2 className="mb-1 text-xs font-bold uppercase tracking-wide text-emerald-700">
            {issue.status.replace(/_/g, " ")}
            {issue.resolvedAt ? ` · ${formatInET(issue.resolvedAt)}` : ""}
          </h2>
          <p className="whitespace-pre-wrap text-sm text-emerald-900">{issue.resolutionNote}</p>
        </div>
      ) : (
        <IssueDetailClient
          issueId={issue.id}
          status={issue.status}
          priority={issue.priority}
          assignedUserId={issue.assignedUser?.id ?? null}
          assignees={assignees}
        />
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Activity</h2>
        {timeline.length === 0 ? (
          <p className="text-sm text-slate-400">No activity yet.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {timeline.map((entry) => (
              <li key={entry.id} className="border-l-2 border-slate-200 pl-3">
                <p className="text-sm font-semibold text-slate-900">
                  {entry.action.replace(/_/g, " ")}
                </p>
                <p className="text-xs text-slate-500">
                  {entry.actor.name} · {formatInET(entry.createdAt)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </main>
  );
}
