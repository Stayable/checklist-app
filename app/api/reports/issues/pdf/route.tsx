import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { IssueStatus, IssuePriority } from "@prisma/client";
import { auth } from "@/lib/auth";
import { accessiblePropertyIds, accessibleProperties } from "@/lib/rbac";
import { getCurrentPropertyId } from "@/lib/current-property";
import { resolveScopedPropertyIds } from "@/lib/property-scope";
import { db } from "@/lib/db";
import { etYYYYMMDD, formatDateInET } from "@/lib/datetime";
import { isSlaBreached } from "@/lib/review";
import { renderPdfToBuffer } from "@/lib/pdf/render";
import { IssuesPdf, type IssuePdfRow } from "@/lib/pdf/IssuesPdf";

// Node runtime required — react-pdf uses Node APIs.
export const runtime = "nodejs";

/** Parse a "yyyy-MM-dd" URL param as a UTC-midnight Date for @db.Date comparisons. */
const parseDateParam = (s: string | null): Date | null =>
  s ? new Date(`${s}T00:00:00.000Z`) : null;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const user = { id: session.user.id as string, role: session.user.role as never };
  const accessible = await accessiblePropertyIds(user);
  const activeId = await getCurrentPropertyId(accessible);
  const scopeIds = resolveScopedPropertyIds(accessible, activeId);
  const properties = await accessibleProperties(user);
  const codeById = new Map(properties.map((p) => [p.id, p.shortCode]));

  const sp = req.nextUrl.searchParams;
  const from = parseDateParam(sp.get("from"));
  const toMidnight = parseDateParam(sp.get("to"));
  // Use an exclusive next-day upper bound so the entire selected end day is included.
  const toExclusive = toMidnight
    ? new Date(toMidnight.getTime() + 24 * 60 * 60 * 1000)
    : null;
  const statusParam = sp.get("status");
  const priorityParam = sp.get("priority");

  const statusFilter =
    statusParam && statusParam in IssueStatus ? (statusParam as IssueStatus) : null;
  const priorityFilter =
    priorityParam && priorityParam in IssuePriority
      ? (priorityParam as IssuePriority)
      : null;

  // Mirror issues page query exactly — same where, orderBy, take, select.
  const issues = await db.issue.findMany({
    where: {
      propertyId: { in: scopeIds },
      ...(from || toExclusive
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(toExclusive ? { lt: toExclusive } : {}),
            },
          }
        : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(priorityFilter ? { priority: priorityFilter } : {}),
    },
    orderBy: [{ createdAt: "desc" }],
    take: 300,
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      slaTargetAt: true,
      resolvedAt: true,
      createdAt: true,
      propertyId: true,
      room: { select: { roomNumber: true } },
      sourceInstance: {
        select: {
          id: true,
          title: true,
          template: { select: { name: true } },
        },
      },
    },
  });

  const now = new Date();

  const rows: IssuePdfRow[] = issues.map((issue) => {
    const breached = isSlaBreached(issue.slaTargetAt, issue.resolvedAt, now);
    const checklist = issue.sourceInstance
      ? (issue.sourceInstance.title ?? issue.sourceInstance.template.name)
      : "—";
    return {
      title: issue.title,
      checklist,
      property: codeById.get(issue.propertyId) ?? issue.propertyId,
      room: issue.room?.roomNumber ?? "—",
      priority: issue.priority,
      status: issue.status.replace(/_/g, " "),
      created: formatDateInET(issue.createdAt),
      sla: breached ? "Breached" : "—",
    };
  });

  const buffer = await renderPdfToBuffer(
    <IssuesPdf rows={rows} title="Issues Found Report" />,
  );

  // Filename: IssuesFound_RISE8_MMDDYY.pdf
  const ymd = etYYYYMMDD();
  const mmddyy = `${ymd.slice(4, 6)}${ymd.slice(6, 8)}${ymd.slice(2, 4)}`;
  const fname = `IssuesFound_RISE8_${mmddyy}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${fname}"`,
      "cache-control": "no-store",
    },
  });
}
