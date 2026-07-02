// Bilingual copy for transactional notification emails (ADR-013: a notification
// sent to a field-staff recipient is translated regardless of the surface that
// generated it). Pure + unit-tested. The checklist/issue label is a proper noun
// (template name, short code, room) and is NOT translated.

export type NotifyEvent =
  | "review_approved"
  | "review_flagged"
  | "review_redo"
  | "issue_assigned";

export const NOTIFY_EVENTS: readonly NotifyEvent[] = [
  "review_approved",
  "review_flagged",
  "review_redo",
  "issue_assigned",
] as const;

type Locale = "en" | "es";

export interface NotifyCopyInput {
  label: string;
  note?: string | null;
}

interface EventStrings {
  subject: (label: string) => string;
  lead: string; // sentence before the label/note
  noteLabel: string; // prefix when a note is attached
}

const COPY: Record<Locale, Record<NotifyEvent, EventStrings>> = {
  en: {
    review_approved: {
      subject: (l) => `Approved: ${l}`,
      lead: "Your submission was approved.",
      noteLabel: "Note",
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
    issue_assigned: {
      subject: (l) => `Issue assigned: ${l}`,
      lead: "An issue was assigned to you.",
      noteLabel: "Details",
    },
  },
  es: {
    review_approved: {
      subject: (l) => `Aprobado: ${l}`,
      lead: "Tu envío fue aprobado.",
      noteLabel: "Nota",
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
    issue_assigned: {
      subject: (l) => `Incidencia asignada: ${l}`,
      lead: "Se te asignó una incidencia.",
      noteLabel: "Detalles",
    },
  },
};

export function notifyEmailCopy(
  event: NotifyEvent,
  locale: Locale,
  input: NotifyCopyInput,
): { subject: string; text: string } {
  const strings = (COPY[locale] ?? COPY.en)[event];
  const note = input.note?.trim();
  const body = note
    ? `${strings.lead}\n\n${input.label}\n\n${strings.noteLabel}: ${note}`
    : `${strings.lead}\n\n${input.label}`;
  return { subject: strings.subject(input.label), text: body };
}
