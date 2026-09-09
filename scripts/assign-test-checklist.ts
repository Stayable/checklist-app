/**
 * Assign one checklist to a named user, for testing the submit -> review ->
 * notify loop end to end.
 *
 * Run (dry by default — pass --apply to write):
 *   pnpm dotenv -e .env.production.local -- tsx scripts/assign-test-checklist.ts \
 *     --email randy@rentstayable.com --template PPA2295 --property KE [--due 18:00] [--apply]
 *
 * Why a script rather than the wizard: the wizard is a manager UI and this is
 * a one-off setup task, but the row it writes must be INDISTINGUISHABLE from a
 * wizard-created one — otherwise the test proves something about a synthetic
 * row rather than about the product. So it reuses the app's own
 * `buildSystemId` and `buildInstanceName`, the same ADR-009 daily sequence,
 * and the same ET due-time arithmetic (`dueAtFor`).
 *
 * Refuses rather than guesses:
 *   * unknown email / template code / short code
 *   * a template that is not published + active — you cannot legitimately
 *     create work from a draft
 *   * a duplicate for the same (property, template, day, assignee)
 */
import { InstanceStatus } from "@prisma/client";
import { db } from "../lib/db";
import { buildSystemId } from "../lib/recurrence";
import { buildInstanceName, type ScopeToken } from "../lib/instance-name";
import { etYMD, etDayStartUtc, etYYYYMMDD } from "../lib/datetime";
import { dueAtFor, DUE_TIME_PATTERN } from "../lib/due-time";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const apply = process.argv.includes("--apply");
  const email = arg("email");
  const code = arg("template");
  const shortCode = arg("property");
  const due = arg("due") ?? "18:00";

  if (!email || !code || !shortCode) {
    console.error(
      "usage: --email <addr> --template <CODE> --property <SHORTCODE> [--due HH:mm] [--apply]",
    );
    process.exit(1);
  }
  if (!DUE_TIME_PATTERN.test(due)) {
    console.error(`--due must be ET HH:mm, got "${due}"`);
    process.exit(1);
  }

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, active: true, role: true, locale: true },
  });
  if (!user) throw new Error(`No user ${email}`);
  if (!user.active) throw new Error(`${email} is inactive — they could not sign in to fill it.`);

  const property = await db.property.findFirst({
    where: { shortCode },
    select: { id: true, shortCode: true, name: true, propertyId: true },
  });
  if (!property) throw new Error(`No property with short code ${shortCode}`);

  const template = await db.checklistTemplate.findUnique({
    where: { code },
    select: {
      id: true,
      code: true,
      name: true,
      version: true,
      publishedAt: true,
      active: true,
      _count: { select: { questions: true } },
    },
  });
  if (!template) throw new Error(`No template with code ${code}`);
  if (!template.publishedAt || !template.active) {
    throw new Error(
      `${code} is not published+active (publishedAt=${template.publishedAt}, active=${template.active}). ` +
        `A draft cannot legitimately have work created from it.`,
    );
  }

  // Access check mirrors the app's: a scoped user needs a row at the property.
  const member = await db.userProperty.findUnique({
    where: { userId_propertyId: { userId: user.id, propertyId: property.id } },
    select: { userId: true },
  });
  if (!member) {
    throw new Error(`${email} has no user_properties row at ${shortCode} — they could not open it.`);
  }

  const ymdIso = etYMD();
  const scheduledFor = etDayStartUtc(ymdIso);
  const dueAt = dueAtFor(ymdIso, due);

  const duplicate = await db.checklistInstance.findFirst({
    where: {
      templateId: template.id,
      propertyId: property.id,
      scheduledFor,
      assignedUserId: user.id,
    },
    select: { id: true, systemId: true },
  });
  if (duplicate) {
    console.error(
      `Already exists: ${duplicate.systemId} — same template, property, day and assignee. Refusing.`,
    );
    process.exit(1);
  }

  // ADR-009: seq restarts each ET day, per (property, template).
  const seq =
    (await db.checklistInstance.count({
      where: { propertyId: property.id, templateId: template.id, scheduledFor },
    })) + 1;

  // PER_ASSIGNEE templates carry the person as their scope token.
  const token: ScopeToken = { kind: "ASSIGNEE", name: user.name ?? user.email };
  const systemId = buildSystemId(property.propertyId, template.code, etYYYYMMDD(scheduledFor), seq);
  const title = buildInstanceName({
    templateName: template.name,
    shortCode: property.shortCode,
    token,
    date: scheduledFor,
  });

  console.log(`assignee     ${user.name} <${user.email}>  (${user.role}, locale ${user.locale})`);
  console.log(`property     ${property.shortCode} — ${property.name} (${property.propertyId})`);
  console.log(`template     ${template.code} v${template.version} — ${template.name} (${template._count.questions} questions)`);
  console.log(`scheduled    ${ymdIso} ET`);
  console.log(`due          ${due} ET  ->  ${dueAt?.toISOString() ?? "none"}`);
  console.log(`systemId     ${systemId}`);
  console.log(`title        ${title}`);

  if (!apply) {
    console.log("\ndry run — nothing written. Re-run with --apply.");
    return;
  }

  const created = await db.checklistInstance.create({
    data: {
      systemId,
      title,
      templateId: template.id,
      // ADR-036: pin the question set as it is right now.
      templateVersion: template.version,
      propertyId: property.id,
      scheduledFor,
      dueAt,
      assignedUserId: user.id,
      status: InstanceStatus.ASSIGNED,
    },
    select: { id: true },
  });
  console.log(`\ncreated ${created.id}`);
  console.log(`https://ops.rentstayable.com/checklists/${created.id}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
