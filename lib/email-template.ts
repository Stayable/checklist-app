/**
 * Stayable Operations — HTML shell for transactional notification email.
 *
 * ADOPTED from the Stayable Rewards project
 * (`Git-Claude/rewards/server/services/email-templates.js`), whose structures
 * come from the **Stayable Elevate Design System** `redesign/emails/*.html`.
 * Kyle's call 2026-09-09: reuse it rather than design a new one, because it is
 * the same brand and it is already production-hardened.
 *
 * What was kept verbatim, and why it looks fussy:
 *   * table-based layout, `role="presentation"`, inline styles — Outlook on
 *     Windows renders with Word, which has no flexbox, no grid and no reliable
 *     `<style>` support
 *   * `mso-table-lspace/rspace`, `-webkit-text-size-adjust`, the `.preheader`
 *     span, `x-apple-disable-message-reformatting` — client-specific fixes.
 *     They are not cruft; deleting them breaks a client you are not testing in
 *   * the `.px` / `.container` mobile overrides — field staff read this on a
 *     phone, mid-shift
 *
 * What changed for this app:
 *   * "Stayable Rewards" masthead → "Stayable Operations"
 *   * rewards-only ornament (confetti, wallet stamp, code box) dropped
 *   * a SEVERITY accent replaces the fixed coral rule, because one shell now
 *     carries "your work was flagged" and "this is due in an hour", and those
 *     must not look identical at a glance
 *   * the footer loses its notification-settings link and gains nothing: these
 *     are transactional work notifications, not marketing, so there is no
 *     unsubscribe to offer
 *
 * ⚠ TWO KNOWN BRAND DIVERGENCES from this app's own UI, inherited deliberately
 * rather than reconciled — flagged to Kyle 2026-09-09, his to settle:
 *   * navy is `#0B1F3A` here vs `--color-navy: #041e42` in `app/globals.css`
 *   * the face is **Poppins** here vs Nunito in the app
 * The Rewards values come from a formal design system, so they may well be the
 * more authoritative source. Do not "fix" either one unilaterally.
 *
 * The plain-text body is NOT replaced by this. It remains the `text/plain`
 * alternative — anything this conveys by colour alone must also survive there.
 */

/** How loud the email should look. Drives the accent rule and the icon. */
export type EmailSeverity = "high" | "medium" | "low";

const ACCENT: Record<EmailSeverity, string> = {
  // Coral — something is wrong and someone must act.
  high: "#E8715A",
  // Gold — time pressure, nothing wrong yet.
  medium: "#FDDA24",
  // Sage — confirmation only.
  low: "#7FAA8A",
};

const ICON: Record<EmailSeverity, string> = {
  high: "⚑",
  medium: "⏰",
  low: "✓",
};

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://ops.rentstayable.com";

export function escapeHtml(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Escape, then turn newlines into `<br>`.
 *
 * Manager notes are free text up to 2000 characters and routinely contain line
 * breaks. Escaping FIRST and only then inserting markup is the whole point —
 * the reverse order would let a note containing `<` produce live HTML in
 * somebody's inbox.
 */
function escapeMultiline(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

function head(lang: "en" | "es", title: string): string {
  return `<!doctype html><html lang="${lang}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting"><title>${escapeHtml(title)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap');
  body, table, td, p, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; border-collapse:collapse; }
  img { -ms-interpolation-mode:bicubic; border:0; outline:none; display:block; }
  body { margin:0; padding:0; width:100% !important; background:#FAF6EE; font-family:'Poppins',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif; color:#3D3A35; }
  a { color:#0080B8; text-decoration:none; }
  .preheader { display:none !important; visibility:hidden; opacity:0; color:transparent; height:0; width:0; overflow:hidden; mso-hide:all; }
  @media screen and (max-width: 600px) {
    .container { width:100% !important; }
    .px { padding-left:24px !important; padding-right:24px !important; }
    .h1 { font-size:28px !important; line-height:1.15 !important; }
  }
</style>
</head><body>`;
}

function masthead(tagline: string): string {
  return `
  <tr>
    <td style="background:#0B1F3A; padding:20px 32px; border-radius:14px 14px 0 0;" class="px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="left" valign="middle" style="font-family:'Poppins',Helvetica,Arial,sans-serif; color:#FFFDF8; font-size:18px; font-weight:700; letter-spacing:-0.01em;">
            Stayable <span style="color:#FDDA24;">Operations</span>
          </td>
          <td align="right" valign="middle" style="font-family:'Poppins',Helvetica,Arial,sans-serif; color:#9FB4D1; font-size:11px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase;">
            ${escapeHtml(tagline)}
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function footer(lang: "en" | "es"): string {
  const line =
    lang === "es"
      ? "Stayable Operations · Un sistema de Stayable Suites"
      : "Stayable Operations · A system of Stayable Suites";
  const auto =
    lang === "es"
      ? "Este es un mensaje automático sobre tu trabajo asignado. No respondas a este correo."
      : "This is an automated message about your assigned work. Do not reply to this email.";
  return `
  <tr>
    <td style="background:#F2EADC; padding:24px 56px; border-top:1px solid #E7DDC9; border-radius:0 0 14px 18px;" class="px">
      <p style="margin:0 0 8px 0; font-family:'Poppins',Helvetica,Arial,sans-serif; font-size:11px; color:#6E6960; line-height:1.6;">${line}</p>
      <p style="margin:0; font-family:'Poppins',Helvetica,Arial,sans-serif; font-size:11px; color:#9A968C; line-height:1.6;">${auto}</p>
    </td>
  </tr>`;
}

export interface NotificationEmailInput {
  lang: "en" | "es";
  severity: EmailSeverity;
  /** Small uppercase kicker above the headline, e.g. "Flagged". */
  eyebrow: string;
  /** Short sentence stating what happened. */
  headline: string;
  /** The checklist identity — a proper noun, never translated. */
  checklistLabel: string;
  /** Label for the note block ("Reason" / "Motivo"). Omitted when no note. */
  noteLabel?: string;
  /** Free text from a manager. Up to 2000 chars, may contain newlines. */
  note?: string | null;
  /** Absolute URL the button opens. */
  ctaUrl?: string;
  ctaLabel?: string;
  /** Hidden inbox-preview line. */
  preheader: string;
  /** Right-hand masthead kicker. */
  tagline: string;
  title: string;
}

export function renderNotificationEmail(input: NotificationEmailInput): string {
  const {
    lang,
    severity,
    eyebrow,
    headline,
    checklistLabel,
    noteLabel,
    note,
    ctaUrl = `${APP_URL}/`,
    ctaLabel,
    preheader,
    tagline,
    title,
  } = input;

  const accent = ACCENT[severity];
  const trimmedNote = note?.trim();
  const cta = ctaLabel ?? (lang === "es" ? "Abrir lista" : "Open checklist");
  const safeUrl = escapeHtml(ctaUrl);
  const pasteLabel =
    lang === "es" ? "O pega este enlace en tu navegador:" : "Or paste this link into your browser:";

  // The note block collapses entirely when absent, rather than rendering an
  // empty bordered box — a "Reason:" with nothing after it reads as a bug.
  const noteBlock = trimmedNote
    ? `
      <tr>
        <td class="px" style="padding:8px 56px 0 56px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFDF8; border:1px solid #E7DDC9; border-left:4px solid ${accent}; border-radius:12px;">
            <tr>
              <td style="padding:18px 22px;">
                <p style="margin:0 0 6px 0; font-family:'Poppins',Helvetica,Arial,sans-serif; font-size:12px; font-weight:700; color:#0B1F3A; letter-spacing:0.08em; text-transform:uppercase;">${escapeHtml(noteLabel ?? "")}</p>
                <p style="margin:0; font-family:'Poppins',Helvetica,Arial,sans-serif; font-size:14px; line-height:1.65; color:#3D3A35;">${escapeMultiline(trimmedNote)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : "";

  return `${head(lang, title)}
<span class="preheader">${escapeHtml(preheader)}</span>

<table role="presentation" width="100%" bgcolor="#FAF6EE" cellpadding="0" cellspacing="0" border="0">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px; background:#FFFDF8; border-radius:14px 14px 18px 14px; box-shadow:0 14px 32px -12px rgba(26,26,26,0.12);">
      ${masthead(tagline)}
      <tr><td style="background:${accent}; height:4px; line-height:4px; font-size:0;">&nbsp;</td></tr>

      <tr>
        <td class="px" style="padding:40px 56px 8px 56px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td align="center" valign="middle" width="56" height="56" style="width:56px; height:56px; background:#F2EADC; border-radius:50%; font-size:26px; font-family:'Poppins',Helvetica,Arial,sans-serif; color:#0B1F3A;">${ICON[severity]}</td>
            </tr>
          </table>

          <p style="margin:22px 0 10px 0; font-family:'Poppins',Helvetica,Arial,sans-serif; font-size:12px; font-weight:700; color:${accent}; letter-spacing:0.18em; text-transform:uppercase;">${escapeHtml(eyebrow)}</p>
          <h1 class="h1" style="margin:0 0 18px 0; font-family:'Poppins',Helvetica,Arial,sans-serif; font-size:32px; line-height:1.15; letter-spacing:-0.025em; color:#0B1F3A; font-weight:800;">${escapeHtml(headline)}</h1>
        </td>
      </tr>

      <tr>
        <td class="px" style="padding:0 56px 8px 56px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F2EADC; border-radius:10px;">
            <tr>
              <td style="padding:14px 18px; font-family:'Poppins',Helvetica,Arial,sans-serif; font-size:15px; font-weight:700; color:#0B1F3A; line-height:1.45;">${escapeHtml(checklistLabel)}</td>
            </tr>
          </table>
        </td>
      </tr>
${noteBlock}
      <tr>
        <td class="px" align="left" style="padding:28px 56px 8px 56px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td bgcolor="#0B1F3A" style="border-radius:10px;">
                <a href="${safeUrl}" style="display:inline-block; padding:16px 32px; font-family:'Poppins',Helvetica,Arial,sans-serif; font-size:15px; font-weight:700; color:#FFFDF8; text-decoration:none; border-radius:10px;">${escapeHtml(cta)}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <tr>
        <td class="px" style="padding:14px 56px 32px 56px;">
          <p style="margin:0 0 8px 0; font-family:'Poppins',Helvetica,Arial,sans-serif; font-size:12px; color:#6E6960;">${pasteLabel}</p>
          <p style="margin:0; font-family:ui-monospace,'JetBrains Mono',Consolas,monospace; font-size:12px; color:#0080B8; word-break:break-all; line-height:1.5; padding:10px 14px; background:#F2EADC; border-radius:8px;">${safeUrl}</p>
        </td>
      </tr>
${footer(lang)}
    </table>
  </td></tr>
</table>
</body></html>`;
}
