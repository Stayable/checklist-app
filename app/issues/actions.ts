"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { GeofenceStatus, IssuePriority, IssueStatus, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { canAccessProperty, requireManager } from "@/lib/rbac";
import { geofenceStatusFor } from "@/lib/geofence";
import { slaHoursByPriority } from "@/lib/issues.server";
import { slaTargetAt } from "@/lib/review";
import {
  deliverNotificationEmail,
  logNotification,
  type NotifyRecipient,
} from "@/lib/notify.server";

// Issue pipeline actions (Phase 4). Open-state edits via updateIssue; closing
// goes through closeIssue and requires a resolution note
// and accepts optional resolution-evidence photos (ADR-015 — uploaded to R2 by
// the client via presigned PUTs, persisted as issue-keyed Photo rows here).

export type IssueResult = { ok: true } | { ok: false; error: string };

const idSchema = z.string().uuid();

async function loadGuarded(issueId: string) {
  const user = await requireManager();
  const issue = await db.issue.findUnique({
    where: { id: issueId },
    select: {
      id: true,
      propertyId: true,
      status: true,
      priority: true,
      assignedUserId: true,
      createdAt: true,
      title: true,
      property: { select: { geofence: true } },
    },
  });
  if (!issue) return { ok: false as const, error: "Issue not found." };
  if (!(await canAccessProperty(user, issue.propertyId))) {
    return { ok: false as const, error: "Not authorized for this property." };
  }
  return { ok: true as const, user, issue };
}

// Terminal statuses. WONT_FIX is no longer settable (W8, 2026-08-31) but stays
// listed here: rows closed that way before the change must still be recognised
// as closed, both by updateIssue's refusal to reopen them and by closeIssue's
// "Already closed." guard. The enum value is deliberately not removed.
const CLOSED: IssueStatus[] = [IssueStatus.RESOLVED, IssueStatus.WONT_FIX];

const updateSchema = z.object({
  status: z
    .nativeEnum(IssueStatus)
    .refine((s) => !CLOSED.includes(s), "Use the resolve flow to close an issue.")
    .optional(),
  priority: z.nativeEnum(IssuePriority).optional(),
  // null clears the assignment; undefined leaves it untouched.
  assignedUserId: z.string().uuid().nullable().optional(),
});

export async function updateIssue(issueId: string, input: unknown): Promise<IssueResult> {
  if (!idSchema.safeParse(issueId).success) return { ok: false, error: "Invalid id." };
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const loaded = await loadGuarded(issueId);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { user, issue } = loaded;

  if (CLOSED.includes(issue.status)) {
    return { ok: false, error: "This issue is closed. Reopen is not supported in v1." };
  }

  const { status, priority, assignedUserId } = parsed.data;
  const data: {
    status?: IssueStatus;
    priority?: IssuePriority;
    assignedUserId?: string | null;
    slaTargetAt?: Date;
  } = {};

  let recipient: NotifyRecipient | null = null;
  if (assignedUserId !== undefined) {
    if (assignedUserId !== null) {
      const assignee = await db.user.findUnique({
        where: { id: assignedUserId },
        select: {
          active: true,
          role: true,
          email: true,
          locale: true,
          properties: { select: { propertyId: true } },
        },
      });
      const memberOfProperty =
        assignee &&
        (assignee.role === Role.CORPORATE ||
          assignee.role === Role.ADMIN ||
          assignee.properties.some((p) => p.propertyId === issue.propertyId));
      if (!assignee?.active || !memberOfProperty) {
        return { ok: false, error: "Assignee must be an active user at this property." };
      }
      data.assignedUserId = assignedUserId;
      recipient = { id: assignedUserId, email: assignee.email, locale: assignee.locale };
      // Assigning an OPEN issue moves it to ASSIGNED unless a status was given.
      if (!status && issue.status === IssueStatus.OPEN) data.status = IssueStatus.ASSIGNED;
    } else {
      data.assignedUserId = null;
    }
  }
  if (status) data.status = status;
  if (priority && priority !== issue.priority) {
    data.priority = priority;
    // Re-anchor the SLA target from creation time using the new priority's hours.
    data.slaTargetAt = slaTargetAt(issue.createdAt, priority, await slaHoursByPriority());
  }
  if (Object.keys(data).length === 0) return { ok: true };

  // Only notify on a fresh assignment (recipient set above).
  const notifyRecipient = data.assignedUserId ? recipient : null;

  const emailLogId = await db.$transaction(async (tx) => {
    await tx.issue.update({ where: { id: issueId }, data });
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        entityType: "issue",
        entityId: issueId,
        action: "update",
        before: {
          status: issue.status,
          priority: issue.priority,
          assignedUserId: issue.assignedUserId,
        },
        after: { ...data, slaTargetAt: data.slaTargetAt?.toISOString() },
      },
    });
    return logNotification(tx, notifyRecipient, "issue_assigned", issue.title, null, {
      type: "issue",
      id: issueId,
    });
  });

  await deliverNotificationEmail(emailLogId, notifyRecipient, "issue_assigned", issue.title, null);

  revalidatePath("/issues");
  revalidatePath(`/issues/${issueId}`);
  return { ok: true };
}

const ISSUE_PHOTO_MAX = 5; // mirrors the presign "issue" scope cap

// Resolution-evidence photo refs. Bytes were already PUT to R2 by the client
// via presigned URLs; we validate the key prefix and compute geofence here.
const photoRefSchema = z.object({
  key: z.string(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  accuracy: z.number().nullable(),
  sizeBytes: z.number(),
});

const closeSchema = z.object({
  // RESOLVED only (W8). A client posting WONT_FIX is now rejected here, not
  // just hidden in the UI — removing a button is not a server-side guarantee.
  status: z.literal(IssueStatus.RESOLVED),
  note: z.string().trim().min(1, "A resolution note is required.").max(2000),
  photos: z.array(photoRefSchema).max(ISSUE_PHOTO_MAX).optional(),
});

// R2 keys are server-minted (lib/r2.ts issuePhotoKey) — a UUID filename under
// the issues/{issueId}/ prefix only. Anything else is a forged reference.
function isValidIssuePhotoKey(key: string, issueId: string): boolean {
  return new RegExp(
    `^issues/${issueId}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.jpg$`,
  ).test(key);
}

export async function closeIssue(issueId: string, input: unknown): Promise<IssueResult> {
  if (!idSchema.safeParse(issueId).success) return { ok: false, error: "Invalid id." };
  const parsed = closeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const loaded = await loadGuarded(issueId);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { user, issue } = loaded;

  if (CLOSED.includes(issue.status)) return { ok: false, error: "Already closed." };
  const { status, note, photos } = parsed.data;

  // Validate + build issue-keyed Photo rows; geofence computed server-side
  // against the property polygon, never trusted from the client (ADR-015).
  const photoRows = (photos ?? []).map((ref) => {
    if (!isValidIssuePhotoKey(ref.key, issueId)) return null;
    return {
      r2Key: ref.key,
      fileSizeBytes: Math.round(ref.sizeBytes),
      gpsLat: ref.lat,
      gpsLng: ref.lng,
      geofenceStatus:
        ref.lat !== null && ref.lng !== null
          ? geofenceStatusFor({ lat: ref.lat, lng: ref.lng }, issue.property.geofence)
          : GeofenceStatus.NO_GPS,
    };
  });
  if (photoRows.some((r) => r === null)) {
    return { ok: false, error: "Invalid photo reference. Re-add the photos and try again." };
  }

  await db.$transaction(async (tx) => {
    await tx.issue.update({
      where: { id: issueId },
      data: { status, resolvedAt: new Date(), resolutionNote: note },
    });
    if (photoRows.length > 0) {
      await tx.photo.createMany({
        data: photoRows.map((r) => ({ issueId, ...r! })),
      });
    }
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        entityType: "issue",
        entityId: issueId,
        action: "resolve",
        before: { status: issue.status },
        after: { status, note, photoCount: photoRows.length },
      },
    });
  });

  revalidatePath("/issues");
  revalidatePath(`/issues/${issueId}`);
  return { ok: true };
}
