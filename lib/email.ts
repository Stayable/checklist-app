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
