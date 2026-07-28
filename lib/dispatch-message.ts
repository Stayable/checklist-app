import type { Locale, Trade } from "@prisma/client";
import { tradeLabel } from "./contractors";

// Dispatch message + deep-link builders (T4). Pure — no I/O, no secrets — so
// the message a contractor receives is unit-testable rather than only
// observable by sending a real WhatsApp.
//
// These build links a HUMAN then taps. A wa.me link cannot send by itself, by
// design: automated outbound needs the WhatsApp Business Platform (see
// docs/component-ii/WhatsAppAutomationSpec_RISE8_072826.md). That is deliberate
// for the MVP — a dispatcher reads the message before it goes out.

/**
 * Normalises a phone number into the digits-only form `wa.me` requires
 * (international, no `+`, no spaces, no punctuation).
 *
 * Returns null when nothing usable is left, so callers render a disabled
 * control instead of a link that opens WhatsApp on a blank chat. A leading
 * `00` international prefix is trimmed to its E.164 equivalent.
 */
export function normalizePhoneForWa(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  // Below ~8 digits can't be a routable international number; treat as unset
  // rather than build a link that silently fails.
  if (digits.length < 8) return null;
  return digits;
}

/** `tel:` target. Keeps a leading `+` because dialers handle E.164 best. */
export function telHref(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const digits = trimmed.replace(/[^\d+]/g, "");
  const bare = digits.replace(/\+/g, "");
  if (bare.length < 8) return null;
  return `tel:${trimmed.startsWith("+") ? "+" : ""}${bare}`;
}

export type DispatchMessageInput = {
  propertyName: string;
  propertyShortCode: string;
  roomLabel: string | null;
  trade: Trade;
  problem: string;
  urgent: boolean;
  /** Absolute URL to the no-account job view, or null if links are disabled. */
  jobUrl: string | null;
  contractorName: string;
};

const COPY = {
  en: {
    urgentPrefix: "URGENT",
    greeting: (name: string) => `Hi ${name},`,
    intro: "we have a job for you:",
    property: "Property",
    where: "Where",
    trade: "Trade",
    problem: "Problem",
    details: "Details and photos",
    closing: "Can you take it, and when could you be on site?",
  },
  es: {
    urgentPrefix: "URGENTE",
    greeting: (name: string) => `Hola ${name}:`,
    intro: "tenemos un trabajo para usted:",
    property: "Propiedad",
    where: "Ubicación",
    trade: "Especialidad",
    problem: "Problema",
    details: "Detalles y fotos",
    closing: "¿Puede atenderlo? ¿A qué hora podría llegar?",
  },
} as const;

/**
 * The message body, in the contractor's own language.
 *
 * Bilingual because most of the roster is Spanish-speaking and
 * `Contractor.language` already records which — sending Spanish to a
 * Spanish-speaking contractor is the difference between a job understood and a
 * job re-explained by phone.
 *
 * The problem text is included verbatim rather than summarised: the dispatcher
 * wrote it for the contractor, and paraphrasing it here would silently change
 * what was asked for.
 */
export function buildDispatchMessage(input: DispatchMessageInput, locale: Locale): string {
  const t = COPY[locale === "es" ? "es" : "en"];
  const lines: string[] = [];

  if (input.urgent) lines.push(`*${t.urgentPrefix}*`);
  lines.push(`${t.greeting(input.contractorName)} ${t.intro}`);
  lines.push("");
  lines.push(`${t.property}: ${input.propertyName} (${input.propertyShortCode})`);
  if (input.roomLabel) lines.push(`${t.where}: ${input.roomLabel}`);
  lines.push(`${t.trade}: ${tradeLabel(input.trade)}`);
  lines.push(`${t.problem}: ${input.problem}`);
  if (input.jobUrl) {
    lines.push("");
    lines.push(`${t.details}: ${input.jobUrl}`);
  }
  lines.push("");
  lines.push(t.closing);

  return lines.join("\n");
}

/**
 * `https://wa.me/<number>?text=<encoded>` — opens WhatsApp with the message
 * pre-typed. Returns null when the contractor has no usable WhatsApp number.
 */
export function waMeUrl(phone: string | null | undefined, message: string): string | null {
  const number = normalizePhoneForWa(phone);
  if (number === null) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
