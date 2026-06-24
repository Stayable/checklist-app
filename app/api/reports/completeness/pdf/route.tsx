import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { IssueStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { accessiblePropertyIds, accessibleProperties } from "@/lib/rbac";
import { getCurrentPropertyId } from "@/lib/current-property";
import { resolveScopedPropertyIds } from "@/lib/property-scope";
import { db } from "@/lib/db";
import { etYYYYMMDD } from "@/lib/datetime";
import { summarizeCompleteness, type StatusCount } from "@/lib/reports";
import { renderPdfToBuffer } from "@/lib/pdf/render";
import { CompletenessPdf } from "@/lib/pdf/CompletenessPdf";

// Node runtime required — react-pdf uses Node APIs.
export const runtime = "nodejs";

/** Parse a "yyyy-MM-dd" URL param as a UTC-midnight Date for @db.Date comparisons. */
const parseDateParam = (s: string | null): Date | null =>
  s ? new Date(`${s}T00:00:00.000Z`) : null;

/** Issue statuses that count as "open" for the with-issues column. */
const OPEN_ISSUE: IssueStatus[] = [
  IssueStatus.OPEN,
  IssueStatus.ASSIGNED,
  IssueStatus.IN_PROGRESS,
];

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
  const codeById = Object.fromEntries(properties.map((p) => [p.id, p.shortCode]));

  const from = parseDateParam(req.nextUrl.searchParams.get("from"));
  const to = parseDateParam(req.nextUrl.searchParams.get("to"));
  const dateWhere =
    from || to
      ? {
          scheduledFor: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {};

  // Group by (property, day, status) — mirrors completeness page query exactly.
  const grouped = await db.checklistInstance.groupBy({
    by: ["propertyId", "scheduledFor", "status"],
    where: { propertyId: { in: scopeIds }, ...dateWhere },
    _count: { _all: true },
  });
  const counts: StatusCount[] = grouped.map((g) => ({
    propertyId: g.propertyId,
    scheduledFor: g.scheduledFor,
    status: g.status,
    count: g._count._all,
  }));

  // With-issues per (property, day): instances that have at least one open sourced issue.
  const issueInstances = await db.checklistInstance.findMany({
    where: {
      propertyId: { in: scopeIds },
      ...dateWhere,
      sourcedIssues: { some: { status: { in: OPEN_ISSUE } } },
    },
    select: { propertyId: true, scheduledFor: true },
  });
  const withIssuesByKey: Record<string, number> = {};
  for (const i of issueInstances) {
    const key = `${i.propertyId}|${etYYYYMMDD(i.scheduledFor)}`;
    withIssuesByKey[key] = (withIssuesByKey[key] ?? 0) + 1;
  }

  const rows = summarizeCompleteness(counts, withIssuesByKey, etYYYYMMDD);

  const buffer = await renderPdfToBuffer(
    <CompletenessPdf rows={rows} codeById={codeById} title="Daily Completeness Report" />,
  );

  // Filename: Completeness_RISE8_MMDDYY.pdf — derive MMDDYY from etYYYYMMDD().slice(2)
  const ymd = etYYYYMMDD();
  const mmddyy = `${ymd.slice(4, 6)}${ymd.slice(6, 8)}${ymd.slice(2, 4)}`;
  const fname = `Completeness_RISE8_${mmddyy}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${fname}"`,
      "cache-control": "no-store",
    },
  });
}
