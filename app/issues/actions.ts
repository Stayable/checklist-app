"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  IssuePriority,
  IssueStatus,
  NotificationChannel,
  NotificationStatus,
  Role,
} from "@prisma/client";
import { db } from "@/lib/db";
import { canAccessProperty, requireManager } from "@/lib/rbac";
import { slaHoursByPriority } from "@/lib/issues.server";
import { slaTargetAt } from "@/lib/review";

// Issue pipeline actions (Phase 4). Open-state edits via updateIssue; closing
// (RESOLVED / WONT_FIX) goes through closeIssue and requires a resolution note.
// Resolution PHOTO requirement is R2-gated — enforced once photo upload lands.

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
    },
  });
  if (!issue) return { ok: false as const, error: "Issue not found." };
  if (!(await canAccessProperty(user, issue.propertyId))) {
    return { ok: false as const, error: "Not authorized for this property." };
  }
  return { ok: true as const, user, issue };
}

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

  if (assignedUserId !== undefined) {
    if (assignedUserId !== null) {
      const assignee = await db.user.findUnique({
        where: { id: assignedUserId },
        select: { active: true, role: true, properties: { select: { propertyId: true } } },
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

  await db.$transaction(async (tx) => {
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
    if (data.assignedUserId) {
      await tx.notificationLog.createMany({
        data: [
          {
            userId: data.assignedUserId,
            channel: NotificationChannel.IN_APP,
            status: NotificationStatus.PENDING,
            event: "issue_assigned",
            title: `Issue assigned: ${issue.title}`,
            entityType: "issue",
            entityId: issueId,
          },
          {
            userId: data.assignedUserId,
            channel: NotificationChannel.EMAIL,
            status: NotificationStatus.SKIPPED,
            event: "issue_assigned",
            title: `Issue assigned: ${issue.title}`,
            entityType: "issue",
            entityId: issueId,
            error: "resend_deferred",
          },
        ],
      });
    }
  });

  revalidatePath("/issues");
  revalidatePath(`/issues/${issueId}`);
  return { ok: true };
}

const closeSchema = z.object({
  status: z.enum([IssueStatus.RESOLVED, IssueStatus.WONT_FIX]),
  note: z.string().trim().min(1, "A resolution note is required.").max(2000),
});

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
  const { status, note } = parsed.data;

  await db.$transaction(async (tx) => {
    await tx.issue.update({
      where: { id: issueId },
      data: { status, resolvedAt: new Date(), resolutionNote: note },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        entityType: "issue",
        entityId: issueId,
        action: status === IssueStatus.RESOLVED ? "resolve" : "wont_fix",
        before: { status: issue.status },
        after: { status, note },
      },
    });
  });

  revalidatePath("/issues");
  revalidatePath(`/issues/${issueId}`);
  return { ok: true };
}
