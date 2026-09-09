"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CompletionCheck, InstanceStatus, IssuePriority } from "@prisma/client";
import { db } from "@/lib/db";
import { canAccessProperty, requireAdmin, requireManager } from "@/lib/rbac";
import { createIssue, slaHoursByPriority } from "@/lib/issues.server";
import { isLocked } from "@/lib/review-lock";
import { normalizeCheckoutFlags } from "@/lib/checkout-flags";
import { roomDisplay } from "@/lib/room-label";
import {
  deliverNotificationEmail,
  logNotification,
  type NotifyRecipient,
} from "@/lib/notify.server";

// Manager review actions (Phase 4, ADR-011): Closed / Flag.
// All write audit_log; recipient notifications write an IN_APP row (PENDING,
// Phase-6 center) + an EMAIL row delivered post-commit via Resend (bilingual
// per ADR-013). Delivery failure never fails the review action.
//
// REVIEW STATE MACHINE (Kyle, 2026-09-10). The manager first sets the
// completion check (Pass/Fail), THEN takes an outcome (Closed/Flag). Four rows,
// and every one of them is enforced here rather than only in the UI — a
// disabled button is a hint, the server action is a live HTTP endpoint:
//
//   PASS + Closed → REVIEWED, completionCheck=PASS, note OPTIONAL,
//                   silent unless the manager opts in (`notifyStaff`)
//   FAIL + Closed → REVIEWED, completionCheck=FAIL, note REQUIRED,
//                   ALWAYS notifies (`review_failed`), no Issue
//   PASS + Flag   → FLAGGED,  completionCheck=PASS, note REQUIRED,
//                   ALWAYS notifies (`review_flagged`), Issue created
//   FAIL + Flag   → FLAGGED,  completionCheck=FAIL, note REQUIRED,
//                   ALWAYS notifies (`review_flagged`), Issue created
//
// The completion check is REQUIRED on both outcomes — a review that never said
// pass or fail is the thing this change exists to stop. The note is
// submission-level (`managerNote`), not per-question: Kyle asked for "the note
// as a whole for the Submission".
//
// Naming: `approveSubmission` and `InstanceStatus.REVIEWED` and the
// `review_approved` notify event keep their old names on purpose. The rename to
// "Closed" is a UI label only; historic `notification_log` and `audit_log` rows
// carry the old values and renaming them breaks reading history back.

export type ReviewResult = { ok: true } | { ok: false; error: string };

const REVIEWABLE: InstanceStatus[] = [InstanceStatus.SUBMITTED, InstanceStatus.FLAGGED];

const LOCKED_ERROR =
  "This checklist has been verified and locked. Ask an admin to unlock it to make changes.";

const idSchema = z.string().uuid();
const noteSchema = z.string().trim().min(1, "A note is required.").max(2000);

async function loadGuarded(instanceId: string) {
  const user = await requireManager();
  const instance = await db.checklistInstance.findUnique({
    where: { id: instanceId },
    include: {
      template: { select: { name: true, collectsCheckoutFlags: true } },
      property: { select: { id: true, shortCode: true } },
      room: { select: { id: true, roomNumber: true } },
      assignedUser: { select: { id: true, name: true, email: true, locale: true } },
    },
  });
  if (!instance) return { ok: false as const, error: "Submission not found." };
  if (!(await canAccessProperty(user, instance.propertyId))) {
    return { ok: false as const, error: "Not authorized for this property." };
  }
  return { ok: true as const, user, instance };
}

function label(instance: {
  template: { name: string };
  property: { shortCode: string };
  room: { roomNumber: string } | null;
  roomLabel: string | null;
}): string {
  const rd = roomDisplay(instance.room, instance.roomLabel);
  const rm = rd ? (instance.room ? ` — Rm ${rd}` : ` — ${rd}`) : "";
  return `${instance.template.name} — ${instance.property.shortCode}${rm}`;
}

/** The submitter is the notification recipient (null when unassigned). */
function recipientOf(instance: {
  assignedUser: { id: string; email: string; locale: "en" | "es" } | null;
}): NotifyRecipient | null {
  const u = instance.assignedUser;
  return u ? { id: u.id, email: u.email, locale: u.locale } : null;
}

const closeSchema = z
  .object({
    // Required, and with no default: a review that never said pass or fail is
    // exactly what the gate exists to refuse. A `.default(PASS)` here would let
    // a caller that simply omitted the field record a pass nobody chose.
    completionCheck: z.nativeEnum(CompletionCheck, {
      // One `error` covers both missing and not-a-CompletionCheck in Zod 4,
      // and both mean the same thing to the manager: you have not chosen yet.
      error: "Set the completion check (Pass or Fail) before closing this submission.",
    }),
    note: z.string().trim().max(2000).optional(),
    // Only consulted on PASS. A FAIL always notifies (see below), so this flag
    // cannot silence one.
    notifyStaff: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.completionCheck === CompletionCheck.FAIL && !v.note?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["note"],
        message: "A reason is required when the completion check is Fail.",
      });
    }
  });

/**
 * "Closed" in the UI — the terminal review outcome that does NOT open an Issue.
 * Carries the manager's completion check (PASS or FAIL) with it, so the check
 * and the outcome are recorded in one audited transaction rather than as two
 * independent writes that can disagree if the second one fails.
 *
 * PASS is silent unless the manager opts in; FAIL always notifies the assignee
 * with the reason, because a fail nobody is told about teaches nobody anything.
 */
export async function approveSubmission(
  instanceId: string,
  input: unknown,
): Promise<ReviewResult> {
  if (!idSchema.safeParse(instanceId).success) return { ok: false, error: "Invalid id." };
  const parsed = closeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const loaded = await loadGuarded(instanceId);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { user, instance } = loaded;
  if (isLocked(instance)) return { ok: false, error: LOCKED_ERROR };

  if (!REVIEWABLE.includes(instance.status)) {
    return { ok: false, error: "Only submitted or flagged checklists can be closed." };
  }
  const { completionCheck, notifyStaff } = parsed.data;
  const failed = completionCheck === CompletionCheck.FAIL;
  const trimmed = parsed.data.note?.trim() || null;
  // A fail is never silent — the toggle only governs the pass case.
  const notify = failed || notifyStaff;
  const event = failed ? "review_failed" : "review_approved";
  const now = new Date();
  const recipient = recipientOf(instance);
  const lbl = label(instance);

  const emailLogId = await db.$transaction(async (tx) => {
    await tx.checklistInstance.update({
      where: { id: instanceId },
      data: {
        status: InstanceStatus.REVIEWED,
        reviewedAt: now,
        reviewedByUserId: user.id,
        managerNote: trimmed,
        completionCheck,
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        entityType: "checklist_instance",
        entityId: instanceId,
        // Kept as "approve" so the existing timeline rows and this one read as
        // the same action — the button was relabelled, the event was not.
        action: "approve",
        before: { status: instance.status, completionCheck: instance.completionCheck },
        after: {
          status: InstanceStatus.REVIEWED,
          completionCheck,
          note: trimmed,
          notifyStaff: notify,
        },
      },
    });
    return notify
      ? logNotification(tx, recipient, event, lbl, trimmed, {
          type: "checklist_instance",
          id: instanceId,
        })
      : null;
  });

  await deliverNotificationEmail(emailLogId, recipient, event, lbl, trimmed);

  revalidatePath("/review");
  revalidatePath(`/review/${instanceId}`);
  return { ok: true };
}

const flagSchema = z.object({
  // Same gate as Closed: the manager states pass or fail before an outcome is
  // available. A flagged submission can still be a PASS — the work was done,
  // something about it needs following up.
  completionCheck: z.nativeEnum(CompletionCheck, {
    error: "Set the completion check (Pass or Fail) before flagging this submission.",
  }),
  note: noteSchema,
  priority: z.nativeEnum(IssuePriority).default(IssuePriority.MEDIUM),
});

/**
 * "Flag" — the outcome that opens an Issue with a priority and an SLA and hands
 * the submission back to the pipeline. Note is required and the assignee is
 * ALWAYS notified: telling someone their work raised an issue is the entire
 * point, so there is deliberately no opt-out toggle here any more.
 */
export async function flagSubmission(
  instanceId: string,
  input: unknown,
): Promise<ReviewResult> {
  if (!idSchema.safeParse(instanceId).success) return { ok: false, error: "Invalid id." };
  const parsed = flagSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const loaded = await loadGuarded(instanceId);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { user, instance } = loaded;
  if (isLocked(instance)) return { ok: false, error: LOCKED_ERROR };

  if (instance.status !== InstanceStatus.SUBMITTED) {
    return { ok: false, error: "Only submitted checklists can be flagged." };
  }
  const { note, priority, completionCheck } = parsed.data;
  const hours = await slaHoursByPriority();
  const recipient = recipientOf(instance);
  const lbl = label(instance);

  const emailLogId = await db.$transaction(async (tx) => {
    await tx.checklistInstance.update({
      where: { id: instanceId },
      data: { status: InstanceStatus.FLAGGED, managerNote: note, completionCheck },
    });
    const issueId = await createIssue(
      tx,
      {
        propertyId: instance.propertyId,
        roomId: instance.room?.id ?? null,
        sourceInstanceId: instanceId,
        title: `Flagged: ${lbl}`,
        description: note,
        priority,
      },
      hours,
    );
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        entityType: "checklist_instance",
        entityId: instanceId,
        action: "flag",
        before: { status: instance.status, completionCheck: instance.completionCheck },
        after: {
          status: InstanceStatus.FLAGGED,
          completionCheck,
          note,
          issueId,
          notifyStaff: true,
        },
      },
    });
    return logNotification(tx, recipient, "review_flagged", lbl, note, {
      type: "checklist_instance",
      id: instanceId,
    });
  });

  await deliverNotificationEmail(emailLogId, recipient, "review_flagged", lbl, note);

  revalidatePath("/review");
  revalidatePath(`/review/${instanceId}`);
  revalidatePath("/issues");
  return { ok: true };
}

// REMOVED 2026-09-09: `requestRedo` — the manager "Request Re-do" review
// action, which sent a SUBMITTED/FLAGGED instance back to ASSIGNED with a
// required note and always notified the submitter. Its two buttons went with it
// (`ReviewActions.tsx`, `ReviewQueueClient.tsx`).
//
// Deleted rather than commented out or left unreferenced: in a "use server"
// file every exported function is a live, publicly-callable HTTP endpoint, so
// an unused one is attack surface, not dead code — the same reasoning that
// removed `createInstanceManually`. Re-do may come back; the restore path is
// `git revert` / `git show` against this commit, not a copy kept here.
//
// Deliberately left in place: the `review_redo` bilingual copy in
// `lib/notify-copy.ts` (historic `notification_log` rows still reference that
// event and would fail to render without it), and `InstanceStatus.ASSIGNED`,
// which the normal assignment flow still uses.

const verifySchema = z.object({
  note: z.string().trim().max(2000).optional(),
  // Verify is internal by default — the PM sign-off doesn't notify staff unless
  // the manager opts in.
  notifyStaff: z.boolean().default(false),
});

/**
 * S1: PM verify + lock. Requires a REVIEWED (Closed) instance; stamps the
 * verify fields and lockedAt=now, making the instance immutable except an
 * admin unlock. Notifies the submitter only when notifyStaff is set.
 */
export async function verifySubmission(
  instanceId: string,
  input?: unknown,
): Promise<ReviewResult> {
  if (!idSchema.safeParse(instanceId).success) return { ok: false, error: "Invalid id." };
  const parsed = verifySchema.safeParse(input ?? {});
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const loaded = await loadGuarded(instanceId);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { user, instance } = loaded;
  if (isLocked(instance)) return { ok: false, error: "This checklist is already verified." };

  if (instance.status !== InstanceStatus.REVIEWED) {
    return { ok: false, error: "Only closed checklists can be verified." };
  }
  const { note, notifyStaff } = parsed.data;
  const trimmed = note?.trim() || null;
  const now = new Date();
  const recipient = recipientOf(instance);
  const lbl = label(instance);

  const emailLogId = await db.$transaction(async (tx) => {
    await tx.checklistInstance.update({
      where: { id: instanceId },
      data: {
        verifiedByPm: true,
        verifiedAt: now,
        verifiedByUserId: user.id,
        lockedAt: now,
        // Persist a verify note so it's visible in the Manager-note card; when
        // no note is entered, leave the prior (Closed) note intact.
        ...(trimmed ? { managerNote: trimmed } : {}),
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        entityType: "checklist_instance",
        entityId: instanceId,
        action: "verify",
        after: { verifiedByPm: true, note: trimmed, notifyStaff },
      },
    });
    return notifyStaff
      ? logNotification(tx, recipient, "review_verified", lbl, trimmed, {
          type: "checklist_instance",
          id: instanceId,
        })
      : null;
  });

  await deliverNotificationEmail(emailLogId, recipient, "review_verified", lbl, trimmed);

  revalidatePath("/review");
  revalidatePath(`/review/${instanceId}`);
  return { ok: true };
}

const checkoutFlagsSchema = z.object({
  notifyCorporate: z.boolean(),
  returnDeposit: z.boolean(),
  itemsToReplace: z.boolean(),
  itemsToReplaceList: z.string().max(2000),
  placeOOO: z.boolean(),
});

/**
 * S1: manager confirms / edits the staff-captured checkout flags at review
 * (Q2=B). Blocked once locked; audited (before/after). Values also lock at
 * Verify via the shared lock guard.
 */
export async function saveCheckoutFlags(
  instanceId: string,
  input: unknown,
): Promise<ReviewResult> {
  if (!idSchema.safeParse(instanceId).success) return { ok: false, error: "Invalid id." };
  const parsed = checkoutFlagsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const loaded = await loadGuarded(instanceId);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { user, instance } = loaded;
  if (isLocked(instance)) return { ok: false, error: LOCKED_ERROR };
  if (!instance.template.collectsCheckoutFlags) {
    return { ok: false, error: "This checklist does not collect checkout flags." };
  }

  const nf = normalizeCheckoutFlags(parsed.data);

  await db.$transaction(async (tx) => {
    await tx.checklistInstance.update({
      where: { id: instanceId },
      data: {
        notifyCorporate: nf.notifyCorporate,
        returnDeposit: nf.returnDeposit,
        itemsToReplace: nf.itemsToReplace,
        itemsToReplaceList: nf.itemsToReplaceList || null,
        placeOOO: nf.placeOOO,
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        entityType: "checklist_instance",
        entityId: instanceId,
        action: "checkout_flags",
        before: {
          notifyCorporate: instance.notifyCorporate,
          returnDeposit: instance.returnDeposit,
          itemsToReplace: instance.itemsToReplace,
          itemsToReplaceList: instance.itemsToReplaceList,
          placeOOO: instance.placeOOO,
        },
        after: nf,
      },
    });
  });

  revalidatePath("/review");
  revalidatePath(`/review/${instanceId}`);
  return { ok: true };
}

/**
 * S1: manager's manual Pass/Fail completion check (Q1). Settable any time the
 * instance is unlocked; audited. The review UI shows the derived hint beside it.
 */
export async function setCompletionCheck(
  instanceId: string,
  value: CompletionCheck,
): Promise<ReviewResult> {
  if (!idSchema.safeParse(instanceId).success) return { ok: false, error: "Invalid id." };
  if (!Object.values(CompletionCheck).includes(value)) {
    return { ok: false, error: "Invalid value." };
  }
  const loaded = await loadGuarded(instanceId);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { user, instance } = loaded;
  if (isLocked(instance)) return { ok: false, error: LOCKED_ERROR };

  await db.$transaction(async (tx) => {
    await tx.checklistInstance.update({
      where: { id: instanceId },
      data: { completionCheck: value },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        entityType: "checklist_instance",
        entityId: instanceId,
        action: "completion_check",
        before: { completionCheck: instance.completionCheck },
        after: { completionCheck: value },
      },
    });
  });

  revalidatePath("/review");
  revalidatePath(`/review/${instanceId}`);
  return { ok: true };
}

/**
 * S1: admin-only unlock (Q4). Clears the verify fields incl. lockedAt so the
 * instance can be re-reviewed. Audited. No staff notification.
 */
export async function unlockSubmission(instanceId: string): Promise<ReviewResult> {
  if (!idSchema.safeParse(instanceId).success) return { ok: false, error: "Invalid id." };
  const user = await requireAdmin();
  const instance = await db.checklistInstance.findUnique({
    where: { id: instanceId },
    select: { id: true, lockedAt: true },
  });
  if (!instance) return { ok: false, error: "Submission not found." };
  if (!isLocked(instance)) return { ok: false, error: "This checklist is not locked." };

  await db.$transaction(async (tx) => {
    await tx.checklistInstance.update({
      where: { id: instanceId },
      data: {
        verifiedByPm: false,
        verifiedAt: null,
        verifiedByUserId: null,
        lockedAt: null,
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        entityType: "checklist_instance",
        entityId: instanceId,
        action: "unlock",
      },
    });
  });

  revalidatePath("/review");
  revalidatePath(`/review/${instanceId}`);
  return { ok: true };
}
