import { NextResponse } from "next/server";
import { TicketStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessNetwork } from "@/lib/rbac";
import { csvFilename, toCsv } from "@/lib/csv";
import { formatDateInET, formatInET } from "@/lib/datetime";
import { deviceTypeLabel } from "@/lib/network/device-type";
import { consoleLabel } from "@/lib/network/unifi-hosts";
import { parseTicketFilters, ticketOrderBy, ticketWhereFilters } from "@/lib/network/ticket-filters";

// CSV export of the ticket list (Kate's B2b ask; Kyle 2026-08-01).
//
// Reads the SAME query params through the SAME parse/where/order helpers as
// /network/tickets, so the file is exactly what the screen shows. Anything else
// invites the classic support question — "the export doesn't match the page".
//
// Node runtime: the export can be large and streams a plain string body.
export const runtime = "nodejs";

const OPEN_STATUSES: TicketStatus[] = [TicketStatus.OPEN, TicketStatus.IN_PROGRESS];

/** Hard cap. Beyond this the answer is a report, not a spreadsheet download. */
const MAX_ROWS = 10_000;

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });
  if (!canAccessNetwork(session.user.role)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const sp = new URL(request.url).searchParams;
  const filters = parseTicketFilters({
    status: sp.get("status") ?? undefined,
    ticketType: sp.get("type") ?? undefined,
    propertyId: sp.get("property") ?? undefined,
    deviceType: sp.get("deviceType") ?? undefined,
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
  });
  const { orderBy } = ticketOrderBy(sp.get("sort") ?? undefined, sp.get("dir") ?? undefined);

  const tickets = await db.ticket.findMany({
    where: {
      status: filters.status ?? { in: OPEN_STATUSES },
      ...ticketWhereFilters(filters),
    },
    orderBy,
    take: MAX_ROWS,
    include: {
      property: { select: { shortCode: true, name: true } },
      device: { select: { name: true, type: true, consoleHostId: true } },
    },
  });

  const header = [
    "Ticket #",
    "Status",
    "Ticket type",
    "Property",
    "Property name",
    "Device",
    "Device type",
    "Console",
    "Opened (ET)",
    "Resolved (ET)",
    "Down minutes",
    "Assigned to",
    "Alert",
    "Resolution notes",
  ];

  const rows = tickets.map((t) => [
    t.ticketNumber,
    t.status,
    t.ticketType,
    t.property.shortCode,
    t.property.name,
    t.device?.name ?? "",
    // Blank, not the "—" the UI shows: a dash in a spreadsheet cell is a value
    // that breaks sorting and filtering.
    t.device?.type ? deviceTypeLabel(t.device.type) : "",
    t.device?.consoleHostId ? consoleLabel(t.device.consoleHostId) : "",
    formatInET(t.openedAt),
    t.resolvedAt ? formatInET(t.resolvedAt) : "",
    t.downDurationMin,
    t.assignedTo,
    t.alertMessage,
    t.resolutionNotes,
  ]);

  // formatDateInET, not formatInET — the latter appends an " ET" suffix, which
  // is right in the UI and wrong in a filename.
  const today = formatDateInET(new Date(), "yyyy-MM-dd");
  return new NextResponse(toCsv(header, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename("network-tickets", today)}"`,
      "Cache-Control": "no-store",
    },
  });
}
