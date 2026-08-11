"use server";

import { db } from "@/lib/db";
import { canAccessProperty, requireMaintenanceAccess } from "@/lib/rbac";
import { etDayStartUtc, formatDateInET, formatInET } from "@/lib/datetime";
import { ymdOf } from "@/lib/contractor-schedule";
import { isTerminalJobStatus, jobStatusLabel, resolveNoteAuthor, tradeLabel } from "@/lib/contractors";

// Read behind the calendar's job popup. Fetched on open rather than shipped with
// every cell: the schedule query already returns up to 500 jobs, and attaching
// each one's note thread to that payload would grow the page for detail almost
// nobody scrolls to.
//
// Authorization is the same as the detail page's — requireMaintenanceAccess plus a
// per-property check — because a popup is not a lesser surface. It returns
// `null` for both "missing" and "not yours", so the popup can never confirm
// that an id exists outside your scope.
//
// Everything datetime-shaped is formatted HERE, server-side, so no ET
// formatting logic (or date-fns-tz) crosses into the client bundle, per ADR-013.

export type JobPreview = {
  id: string;
  title: string;
  propertyLabel: string;
  roomLabel: string | null;
  tradeLabel: string;
  statusLabel: string;
  urgent: boolean;
  terminal: boolean;
  description: string;
  contractorName: string | null;
  scheduledLabel: string;
  createdLabel: string;
  completedLabel: string | null;
  closeNote: string | null;
  notes: { id: string; isSystem: boolean; author: string; body: string; createdAtLabel: string }[];
};

export async function loadJobPreview(jobId: string): Promise<JobPreview | null> {
  const user = await requireMaintenanceAccess();

  const job = await db.contractorJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      propertyId: true,
      roomLabel: true,
      trade: true,
      description: true,
      urgent: true,
      status: true,
      scheduledFor: true,
      completedAt: true,
      closeNote: true,
      createdAt: true,
      property: { select: { shortCode: true, name: true } },
      contractor: { select: { name: true } },
      createdBy: { select: { name: true } },
      notes: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          source: true,
          authorLabel: true,
          body: true,
          createdAt: true,
          authorUser: { select: { name: true } },
        },
      },
    },
  });

  if (!job) return null;
  if (!(await canAccessProperty(user, job.propertyId))) return null;

  return {
    id: job.id,
    title: `${tradeLabel(job.trade)} — ${job.property.shortCode}${
      job.roomLabel ? ` — ${job.roomLabel}` : ""
    }`,
    propertyLabel: `${job.property.shortCode} — ${job.property.name}`,
    roomLabel: job.roomLabel,
    tradeLabel: tradeLabel(job.trade),
    statusLabel: jobStatusLabel(job.status),
    urgent: job.urgent,
    terminal: isTerminalJobStatus(job.status),
    description: job.description,
    contractorName: job.contractor?.name ?? null,
    // A date-only column formatted through the instant its ET day begins —
    // handing formatDateInET the raw UTC-midnight value prints the day before.
    scheduledLabel: job.scheduledFor
      ? formatDateInET(etDayStartUtc(ymdOf(job.scheduledFor)))
      : "Unscheduled backlog",
    createdLabel: `${formatInET(job.createdAt)} by ${job.createdBy.name}`,
    completedLabel: job.completedAt ? formatInET(job.completedAt) : null,
    closeNote: job.closeNote,
    notes: job.notes.map((n) => ({
      id: n.id,
      isSystem: n.source === "SYSTEM",
      author: resolveNoteAuthor({
        source: n.source,
        authorLabel: n.authorLabel,
        author: n.authorUser,
      }),
      body: n.body,
      createdAtLabel: formatInET(n.createdAt),
    })),
  };
}
