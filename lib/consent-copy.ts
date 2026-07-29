import { ConsentChannel } from "@prisma/client";

// Messaging-consent copy. VERBATIM from
// docs/superpowers/specs/2026-07-29-account-creation-and-consent-design.md §5.1.
//
// This is a legal artifact, not UI text: the exact string is persisted into
// ConsentRecord.consentText so we can prove later precisely what a person agreed
// to. Do NOT reword, reflow, or "improve" it without bumping POLICY_VERSION —
// every disclosure phrase here is a Twilio A2P requirement and is pinned by a
// test in lib/consent-copy.test.ts.
//
// ⚠️ The ES text is machine-drafted. It MUST be human-reviewed before being relied
// on legally (spec §9, open item O3) — "the Spanish was machine-translated" is a
// bad answer to a consent challenge.

export const POLICY_VERSION = "2026-07-29.1";

/**
 * Channels a single tick grants. One ConsentRecord row is written per channel,
 * because A2P (SMS) and Meta (WhatsApp) may each need to evidence their own
 * consent independently.
 */
export const CONSENT_CHANNELS = [ConsentChannel.WHATSAPP, ConsentChannel.SMS] as const;

const COPY = {
  en:
    "I agree to receive SMS text messages and WhatsApp messages from Stayable about " +
    "work assignments, job details, and urgent callouts at the mobile number above. " +
    "Typically 0–10 messages per week, depending on job volume. Message and data rates " +
    "may apply. Reply HELP for help or STOP to opt out at any time. Consent is optional " +
    "and is not required to create your account or to be assigned work. See our Terms " +
    "and Conditions and Privacy Policy.",
  es:
    "Acepto recibir mensajes de texto (SMS) y mensajes de WhatsApp de Stayable sobre " +
    "asignaciones de trabajo, detalles de trabajos y llamadas urgentes al número de " +
    "celular indicado arriba. Normalmente de 0 a 10 mensajes por semana, según el " +
    "volumen de trabajo. Pueden aplicarse tarifas de mensajes y datos. Responda HELP " +
    "para obtener ayuda o STOP para darse de baja en cualquier momento. El " +
    "consentimiento es opcional y no es necesario para crear su cuenta ni para recibir " +
    "asignaciones de trabajo. Consulte nuestros Términos y Condiciones y Política de " +
    "Privacidad.",
} as const;

export function consentCopy(locale: "en" | "es"): string {
  return COPY[locale] ?? COPY.en;
}
