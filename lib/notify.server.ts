import { NotificationChannel, NotificationStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { notifyEmailCopy, type NotifyEvent } from "@/lib/notify-copy";

// Notification write + delivery (ADR-013 bilingual for field-staff recipients).
// Split in two so email delivery (a network call) happens AFTER the DB
// transaction commits — never inside it, and never able to fail the user action.

export interface NotifyRecipient {
  id: string;
  email: string;
  locale: "en" | "es";
}

/**
 * Inside a transaction: write the IN_APP row (PENDING, for the Phase-6 center)
 * and the EMAIL row (PENDING — settled post-commit). Returns the EMAIL row id
 * so the caller can deliver + settle it after commit, or null when there is no
 * recipient (nothing logged).
 */
export async function logNotification(
  tx: Prisma.TransactionClient,
  recipient: NotifyRecipient | null,
  event: NotifyEvent,
  label: string,
  note: string | null,
  entity: { type: string; id: string },
): Promise<string | null> {
  if (!recipient) return null;
  const title = notifyEmailCopy(event, recipient.locale, { label, note }).subject;
  const common = {
    userId: recipient.id,
    event,
    title,
    body: note,
    entityType: entity.type,
    entityId: entity.id,
  };
  await tx.notificationLog.create({
    data: { ...common, channel: NotificationChannel.IN_APP, status: NotificationStatus.PENDING },
  });
  const emailRow = await tx.notificationLog.create({
    data: { ...common, channel: NotificationChannel.EMAIL, status: NotificationStatus.PENDING },
    select: { id: true },
  });
  return emailRow.id;
}

/**
 * Post-commit: send the email and settle the EMAIL log row to SENT / FAILED /
 * SKIPPED (unconfigured Resend key). Never throws — a delivery failure must not
 * surface to the user whose action already succeeded.
 */
export async function deliverNotificationEmail(
  emailLogId: string | null,
  recipient: NotifyRecipient | null,
  event: NotifyEvent,
  label: string,
  note: string | null,
): Promise<void> {
  if (!emailLogId || !recipient) return;
  const { subject, text } = notifyEmailCopy(event, recipient.locale, { label, note });
  const res = await sendEmail({ to: recipient.email, subject, text });
  const status = res.ok
    ? NotificationStatus.SENT
    : res.error === "email_not_configured"
      ? NotificationStatus.SKIPPED
      : NotificationStatus.FAILED;
  try {
    await db.notificationLog.update({
      where: { id: emailLogId },
      data: { status, error: res.ok ? null : (res.error ?? "unknown_error") },
    });
  } catch {
    // Best-effort settle; the send outcome is what matters to the recipient.
  }
}
