import { QuestionType, ReviewLevel, Role, TemplateScope } from "@prisma/client";

// ===========================================================================
// 9 checklist templates migrated from Connecteam (CLAUDE.md / ADR-009).
//
// ⚠️  PLACEHOLDER QUESTION CONTENT  ⚠️
// The TEMPLATE METADATA below (code, name, role, scope, review level, cadence)
// is authoritative — taken from CLAUDE.md and ADR-009. The QUESTION SETS are
// DEVELOPMENT PLACEHOLDERS only. They exist so the Phase-3 filling UI has real
// rows to render and collectively cover all 11 question types. They are NOT the
// real Connecteam questions and MUST be replaced with the actual question sets
// pulled from Connecteam / Smartsheet (owner: Karla / Christopher) before any
// training or production use. Do not treat this wording as operational truth.
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

export type SeedTemplate = {
  code: string;
  name: string;
  defaultRole: Role;
  scope: TemplateScope;
  reviewLevel: ReviewLevel;
  allProperties: boolean;
  // Cadence is informational here; real recurrence lives in recurring_rules (Phase 5).
  cadence: string;
  questions: SeedQuestion[];
};

const q = (
  orderIndex: number,
  type: QuestionType,
  prompt: string,
  extra: Partial<SeedQuestion> = {},
): SeedQuestion => ({ orderIndex, type, prompt, required: true, ...extra });

export const TEMPLATES: SeedTemplate[] = [
  {
    code: "ARR",
    name: "Arrival Checklist",
    defaultRole: Role.HK,
    scope: TemplateScope.PER_ROOM,
    reviewLevel: ReviewLevel.MANAGER,
    allProperties: true,
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
    name: "DueOut / Departure",
    defaultRole: Role.HK,
    scope: TemplateScope.PER_ROOM,
    reviewLevel: ReviewLevel.MANAGER,
    allProperties: true,
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
    reviewLevel: ReviewLevel.CORPORATE,
    allProperties: true,
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
    reviewLevel: ReviewLevel.CORPORATE,
    allProperties: true,
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
    reviewLevel: ReviewLevel.CORPORATE,
    allProperties: true,
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
    name: "Maintenance Report",
    defaultRole: Role.MT,
    scope: TemplateScope.AD_HOC,
    reviewLevel: ReviewLevel.MANAGER,
    allProperties: true,
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
    name: "Pressure Washing",
    defaultRole: Role.MT,
    scope: TemplateScope.PER_PROPERTY,
    reviewLevel: ReviewLevel.MANAGER,
    allProperties: true,
    cadence: "monthly / per property",
    questions: [
      q(0, QuestionType.MULTI, "[placeholder] Areas washed", { options: ["Sidewalks", "Breezeways", "Stairs", "Parking", "Dumpster pad"] }),
      q(1, QuestionType.PHOTO, "[placeholder] Completion photo", { photoMin: 1, photoMax: 5 }),
      q(2, QuestionType.SIGNATURE, "[placeholder] Technician signature"),
    ],
  },
  {
    code: "RPM",
    name: "Roof Preventive Maintenance",
    defaultRole: Role.MT,
    scope: TemplateScope.PER_PROPERTY,
    reviewLevel: ReviewLevel.MANAGER,
    allProperties: true,
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
    name: "Room Inspection",
    defaultRole: Role.MANAGER,
    scope: TemplateScope.PER_ROOM,
    reviewLevel: ReviewLevel.NONE,
    allProperties: true,
    cadence: "ad-hoc / per room",
    questions: [
      q(0, QuestionType.PASSFAIL, "[placeholder] Room passes inspection", { failFlagsIssue: true }),
      q(1, QuestionType.SINGLE, "[placeholder] Result", { options: ["Pass", "Conditional", "Fail"] }),
      q(2, QuestionType.PHOTO, "[placeholder] Inspection photo", { photoMin: 1, photoMax: 5 }),
      q(3, QuestionType.LONG_TEXT, "[placeholder] Inspector notes", { required: false }),
    ],
  },
];
