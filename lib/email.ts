import { Resend } from "resend";

// Lazily construct the client so a missing key never throws at import time
// (build/test/CI run without RESEND_API_KEY). Sends are no-ops-with-error when
// unconfigured; the OTP flow surfaces that as a retryable failure.
function client(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  return key ? new Resend(key) : null;
}

const FROM = process.env.RESEND_FROM_EMAIL ?? "StayCheck <no-reply@rentstayable.com>";

const COPY = {
  en: {
    subject: "Your StayCheck sign-in code",
    line: (code: string) => `Your sign-in code is ${code}. It expires in 10 minutes. If you didn't try to sign in, ignore this email.`,
  },
  es: {
    subject: "Tu código de acceso a StayCheck",
    line: (code: string) => `Tu código de acceso es ${code}. Caduca en 10 minutos. Si no intentaste iniciar sesión, ignora este correo.`,
  },
} as const;

export async function sendOtpEmail(
  to: string,
  code: string,
  locale: "en" | "es",
): Promise<{ ok: boolean; error?: string }> {
  const copy = COPY[locale] ?? COPY.en;
  return sendEmail({ to, subject: copy.subject, text: copy.line(code) });
}

// Invite/consent copy (Spec B — invite + consent capture). ACCOUNT invites let
// staff set their own password; CONSENT_ONLY invites capture messaging consent
// only and create no account (contractors work via the dispatch magic-link,
// ADR-012). Both variants share the sendInviteEmail() send path.
const INVITE_COPY = {
  en: {
    ACCOUNT: {
      subject: "Set up your StayCheck account",
      body: (url: string) =>
        `You've been invited to StayCheck. Set your password and confirm your mobile number here:\n\n${url}\n\nThis link expires in 7 days. If you weren't expecting this, ignore this email.`,
    },
    CONSENT_ONLY: {
      subject: "Confirm your contact details for Stayable work assignments",
      body: (url: string) =>
        `Stayable would like to send you work assignments by WhatsApp. Confirm your mobile number here:\n\n${url}\n\nThis link expires in 7 days. Messaging is optional — you can decline and still receive work.`,
    },
  },
  es: {
    ACCOUNT: {
      subject: "Configura tu cuenta de StayCheck",
      body: (url: string) =>
        `Te invitamos a StayCheck. Establece tu contraseña y confirma tu número de celular aquí:\n\n${url}\n\nEste enlace caduca en 7 días. Si no esperabas esto, ignora este correo.`,
    },
    CONSENT_ONLY: {
      subject: "Confirma tus datos de contacto para asignaciones de Stayable",
      body: (url: string) =>
        `Stayable quiere enviarte asignaciones de trabajo por WhatsApp. Confirma tu número de celular aquí:\n\n${url}\n\nEste enlace caduca en 7 días. Los mensajes son opcionales — puedes rechazarlos y seguir recibiendo trabajo.`,
    },
  },
} as const;

export async function sendInviteEmail(
  to: string,
  url: string,
  locale: "en" | "es",
  kind: "ACCOUNT" | "CONSENT_ONLY",
): Promise<{ ok: boolean; error?: string }> {
  const copy = (INVITE_COPY[locale] ?? INVITE_COPY.en)[kind];
  return sendEmail({ to, subject: copy.subject, text: copy.body(url) });
}

/**
 * Generic transactional send. Returns `{ ok:false, error:"email_not_configured" }`
 * when RESEND_API_KEY is unset (build/test/CI) — callers treat that as SKIPPED,
 * not a hard failure. Never throws.
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
}): Promise<{ ok: boolean; error?: string }> {
  const c = client();
  if (!c) return { ok: false, error: "email_not_configured" };
  try {
    const res = await c.emails.send({
      from: FROM,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
    });
    if (res.error) return { ok: false, error: res.error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
