// Bilingual copy for transactional notification emails (ADR-013: a notification
// sent to a field-staff recipient is translated regardless of the surface that
// generated it). Pure + unit-tested. The checklist/issue label is a proper noun
// (template name, short code, room) and is NOT translated.

import { renderNotificationEmail, type EmailSeverity } from "./email-template";

export type NotifyEvent =
  // `review_approved` is the CLOSED-with-a-PASS outcome. The key keeps its
  // original name on purpose: historic `notification_log` rows carry it, and
  // renaming the key would break rendering them. Only the copy below moved to
  // the "Closed" wording the review UI now uses.
  | "review_approved"
  // Closed with a FAIL. Deliberately NOT `review_flagged`: a flag opens an
  // Issue with a priority and an SLA, a closed fail does not — telling someone
  // an issue was raised when none was is a lie they would act on.
  | "review_failed"
  | "review_flagged"
  | "review_redo"
  | "review_verified"
  | "issue_assigned"
  | "invalidation_approved"
  | "invalidation_rejected"
  // ADR-037 due-time reminders. `label` is the checklist; `note` carries the
  // deadline as an ET wall-clock string, already formatted by the caller.
  | "checklist_due_soon"
  | "checklist_due_now";

export const NOTIFY_EVENTS: readonly NotifyEvent[] = [
  "review_approved",
  "review_failed",
  "review_flagged",
  "review_redo",
  "review_verified",
  "issue_assigned",
  "invalidation_approved",
  "invalidation_rejected",
  "checklist_due_soon",
  "checklist_due_now",
] as const;

type Locale = "en" | "es";

export interface NotifyCopyInput {
  label: string;
  note?: string | null;
  /** Absolute URL the email's button opens. Falls back to the app root. */
  url?: string;
}

interface EventStrings {
  subject: (label: string) => string;
  lead: string; // sentence before the label/note
  noteLabel: string; // prefix when a note is attached
}

const COPY: Record<Locale, Record<NotifyEvent, EventStrings>> = {
  en: {
    review_approved: {
      // Still "Approved", not "Closed", even though the manager button now
      // reads Closed: `invalidation_approved` below ALREADY subjects itself
      // "Closed: <label>" and means something else entirely (you no longer
      // have to do this checklist). Two events landing in one inbox under the
      // same subject is a worse failure than a label that differs from the
      // manager's button, and "approved" is still exactly what happened.
      subject: (l) => `Approved: ${l}`,
      lead: "Your submission was approved.",
      noteLabel: "Note",
    },
    review_failed: {
      // Says what happened and what did NOT: no issue was raised, so there is
      // no ticket coming and nothing assigned back to them. Without that line
      // a recipient reasonably waits for a follow-up that never arrives.
      subject: (l) => `Did not pass: ${l}`,
      lead: "Your submission was reviewed and marked as a fail. It is closed — no follow-up issue was raised.",
      noteLabel: "Reason",
    },
    review_flagged: {
      subject: (l) => `Flagged: ${l}`,
      lead: "Your submission was flagged for follow-up.",
      noteLabel: "Note",
    },
    review_redo: {
      subject: (l) => `Re-do requested: ${l}`,
      lead: "A re-do was requested on your submission.",
      noteLabel: "Note",
    },
    review_verified: {
      subject: (l) => `Verified: ${l}`,
      lead: "Your submission was verified by a manager.",
      noteLabel: "Note",
    },
    issue_assigned: {
      subject: (l) => `Issue assigned: ${l}`,
      lead: "An issue was assigned to you.",
      noteLabel: "Details",
    },
    invalidation_approved: {
      subject: (l) => `Closed: ${l}`,
      lead: "Your request to close this checklist was approved. You do not need to complete it.",
      noteLabel: "Note",
    },
    invalidation_rejected: {
      // Says what to DO, not merely what was decided: a rejection means the
      // work is still theirs, and that is the part they need to act on.
      subject: (l) => `Still assigned to you: ${l}`,
      lead: "Your request to close this checklist was declined, so it is still assigned to you.",
      noteLabel: "Reason",
    },
    checklist_due_soon: {
      subject: (l) => `Due in 1 hour: ${l}`,
      lead: "This checklist is due in about an hour and has not been submitted yet.",
      noteLabel: "Due",
    },
    checklist_due_now: {
      // Says what to do, not merely that time is up — the work is still theirs.
      subject: (l) => `Due now: ${l}`,
      lead: "This checklist is due now and has not been submitted yet. Please finish and submit it.",
      noteLabel: "Due",
    },
  },
  es: {
    review_approved: {
      subject: (l) => `Aprobado: ${l}`,
      lead: "Tu envío fue aprobado.",
      noteLabel: "Nota",
    },
    review_failed: {
      subject: (l) => `No aprobado: ${l}`,
      lead: "Tu envío fue revisado y quedó marcado como no aprobado. Está cerrado — no se creó ninguna incidencia de seguimiento.",
      noteLabel: "Motivo",
    },
    review_flagged: {
      subject: (l) => `Marcado: ${l}`,
      lead: "Tu envío fue marcado para seguimiento.",
      noteLabel: "Nota",
    },
    review_redo: {
      subject: (l) => `Se solicitó rehacer: ${l}`,
      lead: "Se solicitó rehacer tu envío.",
      noteLabel: "Nota",
    },
    review_verified: {
      subject: (l) => `Verificado: ${l}`,
      lead: "Un gerente verificó tu envío.",
      noteLabel: "Nota",
    },
    issue_assigned: {
      subject: (l) => `Incidencia asignada: ${l}`,
      lead: "Se te asignó una incidencia.",
      noteLabel: "Detalles",
    },
    invalidation_approved: {
      subject: (l) => `Cerrada: ${l}`,
      lead: "Se aprobó tu solicitud de cerrar esta lista. No necesitas completarla.",
      noteLabel: "Nota",
    },
    invalidation_rejected: {
      subject: (l) => `Sigue asignada a ti: ${l}`,
      lead: "Se rechazó tu solicitud de cerrar esta lista, así que sigue asignada a ti.",
      noteLabel: "Motivo",
    },
    checklist_due_soon: {
      subject: (l) => `Vence en 1 hora: ${l}`,
      lead: "Esta lista vence en aproximadamente una hora y aún no se ha enviado.",
      noteLabel: "Vence",
    },
    checklist_due_now: {
      subject: (l) => `Vence ahora: ${l}`,
      lead: "Esta lista vence ahora y aún no se ha enviado. Por favor complétala y envíala.",
      noteLabel: "Vence",
    },
  },
};

/**
 * How loud each event should look, and the kicker above its headline.
 *
 * Presentation only — it drives the accent rule and eyebrow in the HTML shell
 * (lib/email-template.ts) and changes nothing about the plain-text body. It
 * lives beside the copy rather than inside the template so that adding a
 * NotifyEvent forces you past this table: a new event with no entry here is a
 * TYPE ERROR, not a silently grey email nobody notices is wrong.
 */
const PRESENTATION: Record<
  NotifyEvent,
  { severity: EmailSeverity; eyebrow: Record<Locale, string> }
> = {
  review_approved: { severity: "low", eyebrow: { en: "Closed", es: "Cerrado" } },
  review_failed: { severity: "high", eyebrow: { en: "Did not pass", es: "No aprobado" } },
  review_flagged: { severity: "high", eyebrow: { en: "Flagged", es: "Marcado" } },
  review_redo: { severity: "medium", eyebrow: { en: "Re-do requested", es: "Rehacer" } },
  review_verified: { severity: "low", eyebrow: { en: "Verified", es: "Verificado" } },
  issue_assigned: { severity: "high", eyebrow: { en: "Issue assigned", es: "Incidencia asignada" } },
  invalidation_approved: { severity: "low", eyebrow: { en: "Closed", es: "Cerrada" } },
  invalidation_rejected: {
    severity: "medium",
    eyebrow: { en: "Still assigned", es: "Sigue asignada" },
  },
  checklist_due_soon: { severity: "medium", eyebrow: { en: "Due in 1 hour", es: "Vence en 1 hora" } },
  checklist_due_now: { severity: "medium", eyebrow: { en: "Due now", es: "Vence ahora" } },
};

const TAGLINE: Record<Locale, string> = { en: "Operations", es: "Operaciones" };

export function notifyEmailCopy(
  event: NotifyEvent,
  locale: Locale,
  input: NotifyCopyInput,
): { subject: string; text: string; html: string } {
  const lang: Locale = COPY[locale] ? locale : "en";
  const strings = COPY[lang][event];
  const note = input.note?.trim();
  const subject = strings.subject(input.label);
  const body = note
    ? `${strings.lead}\n\n${input.label}\n\n${strings.noteLabel}: ${note}`
    : `${strings.lead}\n\n${input.label}`;

  const presentation = PRESENTATION[event];
  const html = renderNotificationEmail({
    lang,
    severity: presentation.severity,
    eyebrow: presentation.eyebrow[lang],
    headline: strings.lead,
    checklistLabel: input.label,
    noteLabel: note ? strings.noteLabel : undefined,
    note: note ?? null,
    ctaUrl: input.url,
    // The preheader is the grey line an inbox shows next to the subject. It
    // repeats the lead rather than teasing, because in a phone list view it is
    // often the only body text the reader sees before deciding to open.
    preheader: `${strings.lead} ${input.label}`,
    tagline: TAGLINE[lang],
    title: subject,
  });

  return { subject, text: body, html };
}
