import { InstanceStatus, IssuePriority, PrismaClient, Role, RoomStatus, Trade } from "@prisma/client";
import bcrypt from "bcryptjs";
import { TEMPLATES } from "./templates";
import { etDateOnly, etYYYYMMDD } from "../lib/datetime";
import { SLA_PLACEHOLDER_HOURS } from "../lib/review";

const db = new PrismaClient();

const PROPERTIES = [
  { propertyId: "812",   shortCode: "JN", name: "Jacksonville North", address: "812 Dunn Avenue, Jacksonville, FL 32218" },
  { propertyId: "6802",  shortCode: "JW", name: "Jacksonville West",  address: "910 Suemac Road, Jacksonville, FL 32254" },
  { propertyId: "2295",  shortCode: "KE", name: "Kissimmee East",     address: "2295 E. Irlo Bronson Memorial Hwy, Kissimmee, FL 34744" },
  { propertyId: "5399",  shortCode: "KW", name: "Kissimmee West",     address: "5399 W. Irlo Bronson Memorial Hwy, Kissimmee, FL 34746" },
  { propertyId: "4645",  shortCode: "LL", name: "Lakeland",           address: "4645 N. Socrum Loop Road, Lakeland, FL 33809" },
  { propertyId: "8700",  shortCode: "OR", name: "Orlando OBT",        address: "8700 S. Orange Blossom Trail, Orlando, FL 32809" },
  { propertyId: "2535",  shortCode: "SA", name: "St. Augustine",      address: "2535 State Road 16, St. Augustine, FL 32092" },
  { propertyId: "44199", shortCode: "DP", name: "Davenport",          address: "44199 US Hwy 27, Davenport, FL 33897" },
];

const ADMIN_EMAIL   = "admin@rentstayable.com";
const MANAGER_EMAIL = "manager.lakeland@rentstayable.com";
const HK_EMAIL      = "hk.lakeland@rentstayable.com";
// Temporary admin password for v1 testing — rotate before production cutover.
const ADMIN_PASSWORD = "StayableCheck";
const DEFAULT_PASSWORD = "ChangeMe!2026";

// Real CORPORATE baseline users (portfolio-wide role; no user_properties needed).
// Seeded with DEFAULT_PASSWORD on first creation only — MUST be rotated via /profile
// immediately. The upsert below never overwrites an existing (possibly rotated) password.
// Names are placeholders — edit in /admin/users.
const CORP_USERS = [
  { email: "kate@rentstayable.com", name: "Kate" },
  { email: "bke@rentstayable.com", name: "BKE" },
];

// Demo data (Lakeland manager/HK + rooms + hand-seeded instances) is gated behind
// SEED_DEMO=1. Rationale: production currently shares this dev Neon DB, so a plain
// `db:seed` used to RESURRECT the Lakeland manager/HK accounts that were deliberately
// deleted from the prod user baseline (2026-07-24). Keeping the demo block opt-in means
// the default seed only establishes the safe, idempotent baseline. Remove this guard
// once the prod/dev DB split lands (RUNBOOK §Splitting the Production DB) — after that,
// the dev seed can no longer touch prod and the demo data is harmless.
const SEED_DEMO = process.env.SEED_DEMO === "1";

async function main() {
  // ---- Core baseline (safe for any environment; fully idempotent) ----
  console.log("Seeding properties…");
  for (const p of PROPERTIES) {
    await db.property.upsert({
      where: { propertyId: p.propertyId },
      update: {
        shortCode: p.shortCode,
        name: p.name,
        address: p.address,
      },
      create: p,
    });
  }

  const adminPasswordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  console.log("Seeding admin…");
  await db.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { role: Role.ADMIN, name: "RISE8 Admin", active: true, passwordHash: adminPasswordHash },
    create: {
      email: ADMIN_EMAIL,
      name: "RISE8 Admin",
      role: Role.ADMIN,
      passwordHash: adminPasswordHash,
      mfaEnabled: false,
    },
  });

  const defaultPasswordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);
  console.log("Seeding CORPORATE baseline users…");
  for (const u of CORP_USERS) {
    await db.user.upsert({
      where: { email: u.email },
      // Never touch passwordHash on update — preserves a rotated password.
      update: { role: Role.CORPORATE, name: u.name, active: true },
      create: {
        email: u.email,
        name: u.name,
        role: Role.CORPORATE,
        passwordHash: defaultPasswordHash,
      },
    });
  }

  console.log("Seeding checklist templates + questions (PLACEHOLDER content)…");
  for (const tmpl of TEMPLATES) {
    const template = await db.checklistTemplate.upsert({
      where: { code: tmpl.code },
      update: {
        name: tmpl.name,
        defaultRole: tmpl.defaultRole,
        scope: tmpl.scope,
        reviewLevel: tmpl.reviewLevel,
        allProperties: tmpl.allProperties,
        active: true,
      },
      create: {
        code: tmpl.code,
        name: tmpl.name,
        defaultRole: tmpl.defaultRole,
        scope: tmpl.scope,
        reviewLevel: tmpl.reviewLevel,
        allProperties: tmpl.allProperties,
      },
    });
    // Replace questions wholesale so re-seeding tracks edits to templates.ts.
    await db.question.deleteMany({ where: { templateId: template.id } });
    await db.question.createMany({
      data: tmpl.questions.map((qn) => ({
        templateId: template.id,
        orderIndex: qn.orderIndex,
        type: qn.type,
        prompt: qn.prompt,
        required: qn.required ?? true,
        options: qn.options ? qn.options : undefined,
        photoMin: qn.photoMin ?? null,
        photoMax: qn.photoMax ?? null,
        failFlagsIssue: qn.failFlagsIssue ?? false,
      })),
    });
  }

  console.log("Seeding SLA defaults (placeholders, ADR-014)…");
  for (const priority of Object.values(IssuePriority)) {
    await db.slaDefault.upsert({
      where: { priority },
      update: {}, // don't clobber admin-edited values on re-seed
      create: { priority, hours: SLA_PLACEHOLDER_HOURS[priority] },
    });
  }

  // ---- Demo data (local dev only; gated so it never resurrects prod baseline) ----
  if (SEED_DEMO) {
    await seedDemoData(defaultPasswordHash);
  } else {
    console.log(
      "Skipping demo users/rooms/instances — set SEED_DEMO=1 to include them (see comment in prisma/seed.ts).",
    );
  }

  const propertyCount = await db.property.count();
  const userCount = await db.user.count();
  const templateCount = await db.checklistTemplate.count();
  const questionCount = await db.question.count();
  const instanceCount = await db.checklistInstance.count();
  console.log(
    `\nSeed complete — properties: ${propertyCount}, users: ${userCount}, templates: ${templateCount}, questions: ${questionCount}, instances: ${instanceCount}`,
  );
  console.log("⚠️  Template QUESTION content is PLACEHOLDER — replace with real Connecteam/Smartsheet questions before go-live.");
  console.log(`Admin login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(
    `CORPORATE baseline (${CORP_USERS.map((u) => u.email).join(", ")}) default password: ${DEFAULT_PASSWORD} — ROTATE via /profile immediately.`,
  );
  if (SEED_DEMO) {
    console.log(`Demo accounts default password: ${DEFAULT_PASSWORD}  (rotate before production use)`);
  }
}

/**
 * Local-dev demo data: a Lakeland manager + housekeeper, a handful of rooms, and
 * hand-seeded Arrival instances (assigned + submitted) so the Today / filling /
 * review flows have something to show. NOT part of the production baseline — these
 * accounts were deliberately removed from prod (2026-07-24). Gated behind SEED_DEMO=1.
 */
async function seedDemoData(passwordHash: string) {
  const lakeland = await db.property.findUniqueOrThrow({ where: { propertyId: "4645" } });

  console.log("[demo] Seeding Lakeland manager…");
  const manager = await db.user.upsert({
    where: { email: MANAGER_EMAIL },
    update: { role: Role.MANAGER, name: "Lakeland Manager", active: true },
    create: {
      email: MANAGER_EMAIL,
      name: "Lakeland Manager",
      role: Role.MANAGER,
      passwordHash,
    },
  });
  await db.userProperty.upsert({
    where: { userId_propertyId: { userId: manager.id, propertyId: lakeland.id } },
    update: {},
    create: { userId: manager.id, propertyId: lakeland.id },
  });

  console.log("[demo] Seeding Lakeland HK…");
  const hk = await db.user.upsert({
    where: { email: HK_EMAIL },
    update: { role: Role.HK, name: "Lakeland Housekeeper", active: true },
    create: {
      email: HK_EMAIL,
      name: "Lakeland Housekeeper",
      role: Role.HK,
      passwordHash,
    },
  });
  await db.userProperty.upsert({
    where: { userId_propertyId: { userId: hk.id, propertyId: lakeland.id } },
    update: {},
    create: { userId: hk.id, propertyId: lakeland.id },
  });

  console.log("[demo] Seeding a few Lakeland rooms…");
  for (let n = 101; n <= 105; n++) {
    const roomNumber = String(n);
    await db.room.upsert({
      where: { propertyId_roomNumber: { propertyId: lakeland.id, roomNumber } },
      update: {},
      create: { propertyId: lakeland.id, roomNumber, status: RoomStatus.VACANT },
    });
  }

  console.log("[demo] Seeding today's Arrival checklists for the Lakeland HK…");
  const arr = await db.checklistTemplate.findUniqueOrThrow({ where: { code: "ARR" } });
  const ymd = etYYYYMMDD();
  const today = etDateOnly();
  let seq = 0;
  for (const roomNumber of ["101", "102", "103"]) {
    seq += 1;
    const room = await db.room.findUniqueOrThrow({
      where: { propertyId_roomNumber: { propertyId: lakeland.id, roomNumber } },
    });
    const systemId = `CL-${lakeland.propertyId}-ARR-${ymd}-${String(seq).padStart(3, "0")}`;
    await db.checklistInstance.upsert({
      where: { systemId },
      update: { status: InstanceStatus.ASSIGNED, assignedUserId: hk.id },
      create: {
        systemId,
        templateId: arr.id,
        propertyId: lakeland.id,
        roomId: room.id,
        scheduledFor: today,
        assignedUserId: hk.id,
        status: InstanceStatus.ASSIGNED,
      },
    });
  }

  console.log("[demo] Seeding SUBMITTED Arrival checklists so the review queue is demoable…");
  // Rooms 104/105: one clean submission, one with a FAILED flagged PASSFAIL.
  // Until R2 lands, PHOTO answers carry { count, pendingUpload: true } and
  // SIGNATURE is a tiny placeholder data URL.
  const SIG_DATA_URL =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const arrQuestions = await db.question.findMany({
    where: { templateId: arr.id },
    orderBy: { orderIndex: "asc" },
  });
  const answerFor = (type: string, fail: boolean): unknown => {
    switch (type) {
      case "PASSFAIL": return fail ? "FAIL" : "PASS";
      case "YESNO": return true;
      case "SINGLE": return "Acceptable";
      case "MULTI": return [];
      case "NUMBER": return 0;
      case "SHORT_TEXT": return "Seed data";
      case "LONG_TEXT": return fail ? "Seeded failure for review-queue demo." : "All good.";
      case "PHOTO": return { count: 1, pendingUpload: true };
      case "SIGNATURE": return SIG_DATA_URL;
      case "DATE": return etYYYYMMDD().replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
      default: return null;
    }
  };
  const submittedSpecs = [
    { roomNumber: "104", seq: 4, fail: false },
    { roomNumber: "105", seq: 5, fail: true },
  ];
  for (const spec of submittedSpecs) {
    const room = await db.room.findUniqueOrThrow({
      where: { propertyId_roomNumber: { propertyId: lakeland.id, roomNumber: spec.roomNumber } },
    });
    const systemId = `CL-${lakeland.propertyId}-ARR-${ymd}-${String(spec.seq).padStart(3, "0")}`;
    const openedAt = new Date(Date.now() - 45 * 60_000);
    const submittedAt = new Date(Date.now() - 20 * 60_000);
    const instance = await db.checklistInstance.upsert({
      where: { systemId },
      update: { status: InstanceStatus.SUBMITTED, assignedUserId: hk.id, openedAt, submittedAt },
      create: {
        systemId,
        templateId: arr.id,
        propertyId: lakeland.id,
        roomId: room.id,
        scheduledFor: today,
        assignedUserId: hk.id,
        status: InstanceStatus.SUBMITTED,
        openedAt,
        submittedAt,
      },
    });
    await db.response.deleteMany({ where: { instanceId: instance.id } });
    await db.response.createMany({
      data: arrQuestions
        .filter((q) => q.type !== "SECTION_DIVIDER")
        .map((q) => ({
          instanceId: instance.id,
          questionId: q.id,
          answer: answerFor(q.type, spec.fail) as object,
        })),
    });
  }
  // Contractor directory (Component II — Contractor Dispatch MVP, ADR-025).
  // Roster confirmed by Kyle 2026-07-08. Contact numbers are PLACEHOLDERS, so
  // this sits in the DEMO-gated path (merge decision 2026-07-28): the default
  // seed must leave the production baseline clean, and real contractor numbers
  // are PII to be entered through the /contractors UI, not committed here.
  // Idempotent: keyed by name.
  console.log("Seeding contractor directory (placeholder contacts)…");
  const allProps = await db.property.findMany({ select: { id: true } });
  const allPropIds = allProps.map((p) => p.id);
  const CONTRACTORS: {
    name: string;
    trades: Trade[];
    contracted: boolean;
    whatsapp?: string;
    phone?: string;
    note?: string;
  }[] = [
    { name: "Orlando Torres", trades: [Trade.PLUMBING], contracted: true, phone: "+1 555 000 0001", note: "Direct hire — call first in a plumbing emergency." },
    { name: "Arlis Velázquez", trades: [Trade.PLUMBING], contracted: false, whatsapp: "+1 555 000 0002" },
    { name: "Jesús Pérez", trades: [Trade.ELECTRICAL], contracted: false, whatsapp: "+1 555 000 0003", note: "Also the contractor scheduler — link to his staff account once provisioned." },
    { name: "Cristina de León", trades: [Trade.ELECTRICAL], contracted: false, whatsapp: "+1 555 000 0004" },
  ];
  for (const c of CONTRACTORS) {
    const exists = await db.contractor.findFirst({ where: { name: c.name }, select: { id: true } });
    if (exists) continue;
    await db.contractor.create({
      data: {
        name: c.name,
        trades: c.trades,
        contracted: c.contracted,
        whatsapp: c.whatsapp ?? null,
        phone: c.phone ?? null,
        notes: c.note
          ? `${c.note} (Placeholder contact — replace with real number.)`
          : "Placeholder contact — replace with real number.",
        properties: { create: allPropIds.map((propertyId) => ({ propertyId })) },
      },
    });
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
