/**
 * Send ONE sample notification email to a chosen address, to look at the
 * template (lib/email-template.ts) in a real inbox.
 *
 * Run:  pnpm dotenv -e .env.production.local -- tsx scripts/send-sample-notification-email.ts <to> [event] [lang]
 *   e.g. ... send-sample-notification-email.ts bke@rentstayable.com review_flagged en
 *        ... send-sample-notification-email.ts bke@rentstayable.com review_failed es
 *        ... --dry   writes the HTML to a file and sends nothing
 *
 * ⚠ The recipient is a REQUIRED argument with no default. This sends real mail
 * through Resend, so there is deliberately no "just run it" path that picks an
 * address for you.
 *
 * Nothing is read from or written to the database: no `notification_log` row,
 * no instance touched. This previews the TEMPLATE, it does not rehearse the
 * notification pipeline.
 */
import { writeFileSync } from "node:fs";
import { NOTIFY_EVENTS, notifyEmailCopy, type NotifyEvent } from "../lib/notify-copy";
import { sendEmail } from "../lib/email";

/**
 * A realistic manager note: two paragraphs, a line break, an accent, and an
 * apostrophe. Short lorem text would prove nothing — the note block is the one
 * part of this email that carries arbitrary human input, and the layout has to
 * survive it. `Response.notes` and `managerNote` both cap at 2000 characters.
 */
const SAMPLE_NOTE = `Bathroom was signed off as complete but the photos show the tub was not scrubbed and there is still hair in the drain. The toilet paper holder is empty in photo 4.

Please redo the bathroom before end of shift and re-take all four bathroom photos. If the drain is blocked rather than dirty, raise it with maintenance instead of re-cleaning — don't spend a second pass on it.`;

const SAMPLE_LABEL = "Housekeeping Checklist — KE — Rm 125";

function usage(msg: string): never {
  console.error(msg);
  console.error("");
  console.error("usage: send-sample-notification-email.ts <to> [event] [lang] [--dry]");
  console.error(`events: ${NOTIFY_EVENTS.join(", ")}`);
  console.error("lang:   en | es   (default en)");
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--dry");
  const dry = process.argv.includes("--dry");

  const to = args[0];
  if (!to || !to.includes("@")) usage("A recipient email address is required.");

  const event = (args[1] ?? "review_flagged") as NotifyEvent;
  if (!NOTIFY_EVENTS.includes(event)) usage(`Unknown event "${event}".`);

  const lang = (args[2] ?? "en") as "en" | "es";
  if (lang !== "en" && lang !== "es") usage(`Unknown lang "${lang}".`);

  // Events that carry no manager note render the note block collapsed — that
  // is worth being able to preview too, so key off the event rather than
  // always attaching one.
  const carriesNote =
    event === "review_flagged" || event === "review_failed" || event === "issue_assigned";

  const { subject, text, html } = notifyEmailCopy(event, lang, {
    label: SAMPLE_LABEL,
    note: carriesNote ? SAMPLE_NOTE : null,
    url: "https://ops.rentstayable.com/checklists",
  });

  console.log(`event:    ${event}`);
  console.log(`lang:     ${lang}`);
  console.log(`to:       ${to}`);
  console.log(`subject:  ${subject}`);
  console.log(`note:     ${carriesNote ? `${SAMPLE_NOTE.length} chars` : "none (block collapses)"}`);
  console.log(`html:     ${html.length} bytes`);
  console.log("");
  console.log("--- text/plain part ---");
  console.log(text);
  console.log("");

  if (dry) {
    const out = `outputs/email-previews/sample-${event}-${lang}.html`;
    writeFileSync(out, html, "utf8");
    console.log(`dry run — nothing sent. HTML written to ${out}`);
    return;
  }

  const res = await sendEmail({ to, subject, text, html });
  if (!res.ok) {
    console.error(`send FAILED: ${res.error}`);
    if (res.error === "email_not_configured") {
      console.error("RESEND_API_KEY is not set in the env file you loaded.");
    }
    process.exit(1);
  }
  console.log(`sent to ${to}. Check the inbox (and the spam folder).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
