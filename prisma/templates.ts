import {
  InstanceMultiplicity,
  QuestionType,
  ReviewLevel,
  Role,
  TemplateScope,
} from "@prisma/client";
// ===========================================================================
// The Stayable checklist template library.
//
// 31 rows: the 9 originally migrated from Connecteam (CLAUDE.md / ADR-009) —
// 6 kept and renamed, 3 retired — plus the 22 new ones seeded as drafts (W2 of
// docs/superpowers/specs/2026-08-31-template-library-and-batch-create-design.md).
// 28 of the 31 are the live library; the 3 RETIRED rows stay only so the
// checklist_instances that reference them keep their FKs.
//
// ⚠️  CODES ARE PERMANENT.  ⚠️
// `code` is @unique @db.VarChar(8) and ADR-009 bakes it into every instance
// system ID (CL-4645-ARR-20260901-012) and PDF filename. Renaming a template's
// display name is free. Changing its `code` orphans historical records — never
// do it once an instance exists. Every code must fit 8 characters; that is why
// the PM PA family is PPA{propertyId} and not PAPM{propertyId} (PAPM44199 is 9).
//
// ⚠️  PLACEHOLDER QUESTION CONTENT  ⚠️
// The TEMPLATE METADATA below (code, name, role, scope, copies, review level,
// cadence) is authoritative. The QUESTION SETS on the 9 original templates are
// DEVELOPMENT PLACEHOLDERS only. They exist so the Phase-3 filling UI has real
// rows to render and collectively cover all 11 question types. They are NOT the
// real Connecteam questions and MUST be replaced with the actual question sets
// pulled from Connecteam / Smartsheet (owner: Karla / Christopher) before any
// training or production use. Do not treat this wording as operational truth.
// The 22 new templates ship with ZERO questions on purpose — Kyle authors them
// in the builder, and /templates surfaces them under "Needs questions".
// ===========================================================================

export type SeedQuestion = {
  orderIndex: number;
  type: QuestionType;
  prompt: string;
  required?: boolean;
  options?: string[];
  photoMin?: number;
  photoMax?: number;
  failFlagsIssue?: boolean;
};

/**
 * What the seed asserts about `checklist_templates.active`.
 *
 * ACTIVE  — seeded live. Re-seeding NEVER re-asserts it, so a template Kyle
 *           deactivates in the UI stays deactivated.
 * DRAFT   — seeded inactive with no questions. Re-seeding NEVER re-asserts it
 *           either, so a draft Kyle fills in and activates STAYS ACTIVE.
 * RETIRED — seeded inactive, and re-asserted inactive on every run. Retirement
 *           is a decision recorded in this file; to undo it, edit this file.
 */
export type TemplateLifecycle = "ACTIVE" | "DRAFT" | "RETIRED";

export type SeedTemplate = {
  code: string;
  name: string;
  defaultRole: Role;
  /** The subject axis: what one instance is ABOUT (room / property / ad-hoc). */
  scope: TemplateScope;
  /** The multiplicity axis (W1): how many instances one subject yields per day. */
  copies: InstanceMultiplicity;
  reviewLevel: ReviewLevel;
  allProperties: boolean;
  lifecycle: TemplateLifecycle;
  // Cadence is informational here; real recurrence lives in recurring_rules (Phase 5).
  cadence: string;
  questions: SeedQuestion[];
};

/** `checklist_templates.code` is @db.VarChar(8). Enforced by test, not by hope. */
export const TEMPLATE_CODE_MAX_LENGTH = 8;

/**
 * Splits `active` across the two halves of the upsert.
 *
 * `create` runs once, on a database that has never seen the code, so it may say
 * anything. `update` runs on every re-seed against rows a human has since
 * touched, so it may only assert what this file is genuinely the authority on.
 * It is the authority on retirement and on nothing else — which is why ACTIVE
 * and DRAFT both return `undefined` and leave the column alone.
 */
export function seedActiveFields(lifecycle: TemplateLifecycle): {
  create: boolean;
  update: boolean | undefined;
} {
  switch (lifecycle) {
    case "ACTIVE":
      return { create: true, update: undefined };
    case "DRAFT":
      return { create: false, update: undefined };
    case "RETIRED":
      return { create: false, update: false };
  }
}

const q = (
  orderIndex: number,
  type: QuestionType,
  prompt: string,
  extra: Partial<SeedQuestion> = {},
): SeedQuestion => ({ orderIndex, type, prompt, required: true, ...extra });

/**
 * Property IDs, in the order the per-property template families are generated.
 * Kept local on purpose: these are template CODE fragments, permanent once an
 * instance exists, so they must not drift with the properties table.
 * 812 JN · 2295 KE · 2535 SA · 4645 LL · 5399 KW · 6802 JW · 8700 OR · 44199 DP
 */
export const TEMPLATE_PROPERTY_IDS = [
  "812",
  "2295",
  "2535",
  "4645",
  "5399",
  "6802",
  "8700",
  "44199",
] as const;

/**
 * One draft per property for a family whose code is `{prefix}{propertyId}`.
 * `prefix` must be short enough that the longest property ID still fits 8 chars.
 */
function perPropertyFamily(args: {
  prefix: string;
  nameSuffix: string;
  defaultRole: Role;
  reviewLevel: ReviewLevel;
  cadence: string;
}): SeedTemplate[] {
  return TEMPLATE_PROPERTY_IDS.map((propertyId) => ({
    code: `${args.prefix}${propertyId}`,
    name: `${propertyId} ${args.nameSuffix}`,
    defaultRole: args.defaultRole,
    scope: TemplateScope.PER_PROPERTY,
    copies: InstanceMultiplicity.PER_ASSIGNEE,
    reviewLevel: args.reviewLevel,
    allProperties: true,
    lifecycle: "DRAFT" as const,
    cadence: args.cadence,
    questions: [],
  }));
}

/** A new W2 template: inactive, global (D18 — no TemplateProperty rows), no questions. */
function draft(args: {
  code: string;
  name: string;
  defaultRole: Role;
  scope: TemplateScope;
  copies: InstanceMultiplicity;
  reviewLevel?: ReviewLevel;
  cadence: string;
}): SeedTemplate {
  return {
    code: args.code,
    name: args.name,
    defaultRole: args.defaultRole,
    scope: args.scope,
    copies: args.copies,
    reviewLevel: args.reviewLevel ?? ReviewLevel.MANAGER,
    allProperties: true,
    lifecycle: "DRAFT",
    cadence: args.cadence,
    questions: [],
  };
}

export const TEMPLATES: SeedTemplate[] = [
  {
    code: "ARR",
    name: "Arrival Checklist",
    defaultRole: Role.HK,
    scope: TemplateScope.PER_ROOM,
    copies: InstanceMultiplicity.ONE,
    reviewLevel: ReviewLevel.MANAGER,
    allProperties: true,
    lifecycle: "ACTIVE",
    cadence: "daily / per room",
    questions: [
      q(0, QuestionType.SECTION_DIVIDER, "Room condition", { required: false }),
      q(1, QuestionType.PASSFAIL, "[placeholder] Room passes arrival inspection", { failFlagsIssue: true }),
      q(2, QuestionType.YESNO, "[placeholder] Linens and towels stocked to par?"),
      q(3, QuestionType.SINGLE, "[placeholder] Overall cleanliness rating", { options: ["Excellent", "Acceptable", "Needs rework"] }),
      q(4, QuestionType.PHOTO, "[placeholder] Photo of made bed", { photoMin: 1, photoMax: 3 }),
      q(5, QuestionType.PHOTO, "[placeholder] Photo of bathroom", { photoMin: 1, photoMax: 3 }),
      q(6, QuestionType.LONG_TEXT, "[placeholder] Notes / issues found", { required: false }),
      q(7, QuestionType.SIGNATURE, "[placeholder] Attendant signature"),
    ],
  },
  {
    code: "DEP",
    name: "Due Out Checklist",
    defaultRole: Role.HK,
    scope: TemplateScope.PER_ROOM,
    copies: InstanceMultiplicity.ONE,
    reviewLevel: ReviewLevel.MANAGER,
    allProperties: true,
    lifecycle: "ACTIVE",
    cadence: "daily / per room",
    questions: [
      q(0, QuestionType.MULTI, "[placeholder] Items requiring restock", { required: false, options: ["Coffee", "Toiletries", "Towels", "Trash liners"] }),
      q(1, QuestionType.PASSFAIL, "[placeholder] Room ready for next guest", { failFlagsIssue: true }),
      q(2, QuestionType.NUMBER, "[placeholder] Number of damaged items", { required: false }),
      q(3, QuestionType.PHOTO, "[placeholder] Photo of departure condition", { photoMin: 1, photoMax: 5 }),
      q(4, QuestionType.SIGNATURE, "[placeholder] Attendant signature"),
    ],
  },
  {
    code: "HKR",
    name: "HK Review",
    defaultRole: Role.MANAGER,
    scope: TemplateScope.PER_PROPERTY,
    copies: InstanceMultiplicity.ONE,
    reviewLevel: ReviewLevel.CORPORATE,
    allProperties: true,
    lifecycle: "RETIRED",
    cadence: "weekly / per property",
    questions: [
      q(0, QuestionType.NUMBER, "[placeholder] Rooms inspected this week"),
      q(1, QuestionType.SINGLE, "[placeholder] Team performance", { options: ["On track", "Needs coaching", "Underperforming"] }),
      q(2, QuestionType.LONG_TEXT, "[placeholder] Coaching notes", { required: false }),
    ],
  },
  {
    code: "PAR",
    name: "PA Review",
    defaultRole: Role.MANAGER,
    scope: TemplateScope.PER_PROPERTY,
    copies: InstanceMultiplicity.ONE,
    reviewLevel: ReviewLevel.CORPORATE,
    allProperties: true,
    lifecycle: "RETIRED",
    cadence: "weekly / per property",
    questions: [
      q(0, QuestionType.PASSFAIL, "[placeholder] Common areas meet standard"),
      q(1, QuestionType.YESNO, "[placeholder] Supplies adequately stocked?"),
      q(2, QuestionType.LONG_TEXT, "[placeholder] Notes", { required: false }),
    ],
  },
  {
    code: "MGR",
    name: "Manager Review",
    defaultRole: Role.MANAGER,
    scope: TemplateScope.PER_PROPERTY,
    copies: InstanceMultiplicity.ONE,
    reviewLevel: ReviewLevel.CORPORATE,
    allProperties: true,
    lifecycle: "RETIRED",
    cadence: "weekly / per property",
    questions: [
      q(0, QuestionType.DATE, "[placeholder] Week ending"),
      q(1, QuestionType.SINGLE, "[placeholder] Property condition", { options: ["Excellent", "Good", "Fair", "Poor"] }),
      q(2, QuestionType.PHOTO, "[placeholder] Property exterior photo", { required: false, photoMin: 1, photoMax: 4 }),
      q(3, QuestionType.LONG_TEXT, "[placeholder] Summary", { required: false }),
    ],
  },
  {
    code: "MNT",
    name: "Maintenance Checklist",
    defaultRole: Role.MT,
    scope: TemplateScope.AD_HOC,
    copies: InstanceMultiplicity.PER_TASK,
    reviewLevel: ReviewLevel.MANAGER,
    allProperties: true,
    lifecycle: "ACTIVE",
    cadence: "daily / per task or area",
    questions: [
      q(0, QuestionType.SHORT_TEXT, "[placeholder] Task / area"),
      q(1, QuestionType.SINGLE, "[placeholder] Category", { options: ["Plumbing", "Electrical", "HVAC", "Structural", "Other"] }),
      q(2, QuestionType.PASSFAIL, "[placeholder] Repair completed", { failFlagsIssue: true }),
      q(3, QuestionType.PHOTO, "[placeholder] Before photo", { photoMin: 1, photoMax: 3 }),
      q(4, QuestionType.PHOTO, "[placeholder] After photo", { required: false, photoMin: 1, photoMax: 3 }),
      q(5, QuestionType.LONG_TEXT, "[placeholder] Work performed", { required: false }),
    ],
  },
  {
    code: "PWR",
    name: "Monthly Pressure Washing",
    defaultRole: Role.MT,
    scope: TemplateScope.PER_PROPERTY,
    copies: InstanceMultiplicity.ONE,
    reviewLevel: ReviewLevel.MANAGER,
    allProperties: true,
    lifecycle: "ACTIVE",
    cadence: "monthly / per property",
    questions: [
      q(0, QuestionType.MULTI, "[placeholder] Areas washed", { options: ["Sidewalks", "Breezeways", "Stairs", "Parking", "Dumpster pad"] }),
      q(1, QuestionType.PHOTO, "[placeholder] Completion photo", { photoMin: 1, photoMax: 5 }),
      q(2, QuestionType.SIGNATURE, "[placeholder] Technician signature"),
    ],
  },
  {
    code: "RPM",
    name: "Roof PM Checklist",
    defaultRole: Role.MT,
    scope: TemplateScope.PER_PROPERTY,
    copies: InstanceMultiplicity.ONE,
    reviewLevel: ReviewLevel.MANAGER,
    allProperties: true,
    lifecycle: "ACTIVE",
    cadence: "quarterly / per property",
    questions: [
      q(0, QuestionType.PASSFAIL, "[placeholder] Roof free of visible damage", { failFlagsIssue: true }),
      q(1, QuestionType.YESNO, "[placeholder] Drains and gutters clear?"),
      q(2, QuestionType.PHOTO, "[placeholder] Roof condition photos", { photoMin: 2, photoMax: 8 }),
      q(3, QuestionType.LONG_TEXT, "[placeholder] Findings", { required: false }),
    ],
  },
  {
    code: "RIN",
    name: "Monthly Room Inspection",
    defaultRole: Role.MANAGER,
    scope: TemplateScope.PER_ROOM,
    copies: InstanceMultiplicity.ONE,
    reviewLevel: ReviewLevel.NONE,
    allProperties: true,
    lifecycle: "ACTIVE",
    cadence: "ad-hoc / per room",
    questions: [
      q(0, QuestionType.PASSFAIL, "[placeholder] Room passes inspection", { failFlagsIssue: true }),
      q(1, QuestionType.SINGLE, "[placeholder] Result", { options: ["Pass", "Conditional", "Fail"] }),
      q(2, QuestionType.PHOTO, "[placeholder] Inspection photo", { photoMin: 1, photoMax: 5 }),
      q(3, QuestionType.LONG_TEXT, "[placeholder] Inspector notes", { required: false }),
    ],
  },

  // =========================================================================
  // W2 — the new library, seeded as DRAFTS.
  //
  // Every one is `active: false`, `allProperties: true` (D18 — templates are
  // global, so no TemplateProperty rows), and carries ZERO questions. Kyle
  // authors the question sets in the builder; /templates lists them under the
  // "Needs questions" chip until he does.
  //
  // NOT seeded, parked pending Kyle's frequency/scope decision (D22):
  // Lock Installation · Stayable Renovation Completion · Daily Contractor Checklist.
  // =========================================================================
  draft({
    code: "LFLIP",
    name: "Lease Arrival / Lease Flip Checklist",
    defaultRole: Role.HK,
    scope: TemplateScope.PER_ROOM,
    copies: InstanceMultiplicity.ONE,
    cadence: "on turnover / per room",
  }),
  draft({
    code: "DOWALK",
    name: "Due Out Room Walk",
    defaultRole: Role.PA,
    scope: TemplateScope.PER_PROPERTY,
    copies: InstanceMultiplicity.ONE,
    cadence: "daily / per property",
  }),
  draft({
    code: "HKC",
    name: "Housekeeping Checklist",
    defaultRole: Role.HK,
    scope: TemplateScope.PER_ROOM,
    copies: InstanceMultiplicity.ONE,
    cadence: "daily / per room",
  }),
  draft({
    code: "PAAM",
    name: "AM PA Checklist",
    defaultRole: Role.PA,
    scope: TemplateScope.PER_PROPERTY,
    copies: InstanceMultiplicity.PER_ASSIGNEE,
    cadence: "daily / per morning-shift PA",
  }),
  draft({
    code: "PINSP",
    name: "Property Inspection Checklist",
    defaultRole: Role.PA,
    scope: TemplateScope.PER_PROPERTY,
    copies: InstanceMultiplicity.PER_ASSIGNEE,
    cadence: "monthly / per assignee",
  }),
  draft({
    code: "PTASK",
    name: "Property Task Checklist",
    defaultRole: Role.MT,
    scope: TemplateScope.PER_PROPERTY,
    copies: InstanceMultiplicity.PER_TASK,
    cadence: "ad-hoc / per task",
  }),

  // 8 PM PA checklists. Code prefix is PPA, not PAPM: PAPM44199 is 9 characters
  // and `code` is VarChar(8). AM/PM are shift labels, not roles (D20) — both PA
  // families draw from the same PA pool.
  ...perPropertyFamily({
    prefix: "PPA",
    nameSuffix: "PM PA Checklist",
    defaultRole: Role.PA,
    reviewLevel: ReviewLevel.MANAGER,
    cadence: "daily / per afternoon-shift PA",
  }),

  // 8 Manager checklists. These supersede the retired MGR "Manager Review" —
  // MGR and MGR812 are distinct codes and both exist.
  // reviewLevel is CORPORATE because the filler IS the property manager.
  ...perPropertyFamily({
    prefix: "MGR",
    nameSuffix: "Manager Checklist",
    defaultRole: Role.MANAGER,
    reviewLevel: ReviewLevel.CORPORATE,
    cadence: "daily / per manager",
  }),
];
