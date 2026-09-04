/**
 * Turn the extracted Connecteam PDF question sets into seed data.
 *
 * Run:  pnpm tsx scripts/build-connecteam-questions.ts
 * In:   scripts/data/ConnecteamTemplates_*.json   (three extraction passes)
 * Out:  prisma/data/connecteam-questions.ts       (generated, do not hand-edit)
 *
 * The extractions are the record of what the live Connecteam forms ask. This
 * script is the only place their vocabulary is translated into ours, so every
 * judgement call about types, requiredness and repeats lives here and is
 * reviewable in one file.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { QuestionType } from "@prisma/client";

type ExtractedQuestion = {
  order: number;
  section?: string | null;
  prompt: string;
  inferredType: string;
  seenInSamples?: number;
  ofSamples?: number;
  sampleAnswer?: string | null;
  repeatedTimesInPdf?: number;
};

type ExtractedTemplate = {
  connecteamName: string;
  samples?: unknown[];
  questions: ExtractedQuestion[];
};

const SOURCES = [
  "scripts/data/ConnecteamTemplates_Ops_RISE8_090126.json",
  "scripts/data/ConnecteamTemplates_PA_RISE8_090126.json",
  "scripts/data/ConnecteamTemplates_MgrArrival_RISE8_090126.json",
];

/** Connecteam's form name -> our permanent 8-char template code (ADR-009). */
const CODE_BY_NAME: Record<string, string> = {
  "AM PA Checklist": "PAAM",
  "Arrival Checklist": "ARR",
  "Lease Arrival/Lease Flip Checklist": "LFLIP",
  "Due Out Checklist": "DEP",
  "Due Out Room Walk": "DOWALK",
  "Housekeeping Checklist": "HKC",
  "Maintenance Checklist": "MNT",
  "Room Inspection Checklist": "RIN",
  "Property Inspection Checklist": "PINSP",
  "Monthly Pressure Washing Checklist": "PWR",
  "Roof Preventive Maintenance Checklist": "RPM",
};
const PROPERTY_IDS = ["812", "2295", "2535", "4645", "5399", "6802", "8700", "44199"];
for (const id of PROPERTY_IDS) {
  CODE_BY_NAME[`${id} PM PA Checklist`] = `PPA${id}`;
  CODE_BY_NAME[`${id} Manager Checklist`] = `MGR${id}`;
}

/**
 * The three checkpoint rounds, confirmed against the live Connecteam form
 * (screenshot, 8700 PM PA Checklist 09/01/26): the SAME prompt appears three
 * times, distinguished only by a time sub-label. Three questions rather than
 * one three-photo question, so each round carries its own capture time and
 * geofence stamp -- which is the whole point of a checkpoint round.
 */
const CHECKPOINT_SLOTS = ["7:00pm", "10:00pm", "End of shift"];

/**
 * Prompts whose inferred type the extraction itself flagged as uncertain, and
 * which the evidence resolves the other way.
 *
 * `Unit #` rendered as a bare label with no value in every ARR / DEP / LFLIP
 * sample, which in this PDF format reads as PHOTO -- so that is what the
 * extraction recorded, with a note saying it could equally be a text field
 * nobody filled in. Two things settle it as text:
 *
 *   1. The SAME prompt was read as TEXT in the Housekeeping Checklist.
 *   2. `Bldg and Unit #` on the Room Inspection Checklist is the only sample
 *      anywhere that was actually ANSWERED -- "B#121", "222", "Bldg A unit
 *      210". Free text, not a picker and not a photo.
 *
 * A unit number is also the identifying field of the submission; a photo of it
 * cannot be searched, filtered or joined to a room.
 *
 * ⚠ Still unverified against Connecteam's real field definitions, which were
 * never visible. This is a better reading of the same evidence, not a fact.
 */
const OVERRIDES: Record<string, { type: QuestionType; required: boolean }> = {
  // `required` is pinned rather than recomputed. isRequired() makes every PHOTO
  // required, so changing the type alone would quietly flip this field to
  // optional as a side effect. Whether a unit number should be required at all
  // is a separate question -- our PER_ROOM instances already carry the room as
  // their subject, which Connecteam had no concept of.
  "Unit #": { type: QuestionType.SHORT_TEXT, required: true },
};

function mapType(q: ExtractedQuestion): QuestionType {
  const override = OVERRIDES[q.prompt.trim()];
  if (override) return override.type;

  switch (q.inferredType) {
    case "PHOTO":
      return QuestionType.PHOTO;
    case "SIGNATURE":
      return QuestionType.SIGNATURE;
    case "SECTION_DIVIDER":
      return QuestionType.SECTION_DIVIDER;
    case "YESNO":
      return QuestionType.YESNO;
    case "SINGLE":
      return QuestionType.SINGLE;
    // A bare task line with no answer field. Kyle's call: PASSFAIL rather than
    // YESNO, because it unlocks failFlagsIssue -- a missed task can raise an
    // Issue instead of sitting invisible inside a submitted checklist.
    case "TASK_CHECKBOX":
      return QuestionType.PASSFAIL;
    default:
      return /descri|notes?|comment/i.test(q.prompt)
        ? QuestionType.LONG_TEXT
        : QuestionType.SHORT_TEXT;
  }
}

/**
 * Kyle: "For No Answers we can leave it like not required."
 *
 * A question nobody ever answered across every sample is not enforced. Photos
 * and signatures are exempt: their "answer" is the file, never a string, so the
 * rule would mark every photo optional -- and the live form shows the checkpoint
 * photos carrying a required marker.
 */
function isRequired(q: ExtractedQuestion, type: QuestionType): boolean {
  const override = OVERRIDES[q.prompt.trim()];
  if (override) return override.required;
  if (type === QuestionType.SECTION_DIVIDER) return false;
  if (type === QuestionType.PHOTO || type === QuestionType.SIGNATURE) return true;
  return q.sampleAnswer != null && q.sampleAnswer !== "";
}

type SeedQ = {
  orderIndex: number;
  type: QuestionType;
  prompt: string;
  hint?: string;
  required: boolean;
};

function buildQuestions(t: ExtractedTemplate): SeedQ[] {
  const out: SeedQ[] = [];
  let lastSection: string | null = null;
  let order = 0;

  for (const q of [...t.questions].sort((a, b) => a.order - b.order)) {
    const section = q.section?.trim() || null;
    if (section && section !== lastSection) {
      out.push({
        orderIndex: order++,
        type: QuestionType.SECTION_DIVIDER,
        prompt: section,
        required: false,
      });
      lastSection = section;
    }

    const type = mapType(q);
    if (type === QuestionType.SECTION_DIVIDER) continue; // already emitted above

    const repeats = q.repeatedTimesInPdf ?? 1;
    if (repeats === CHECKPOINT_SLOTS.length && /checkpoint/i.test(q.prompt)) {
      for (const slot of CHECKPOINT_SLOTS) {
        out.push({
          orderIndex: order++,
          type,
          prompt: q.prompt,
          hint: slot,
          required: isRequired(q, type),
        });
      }
      continue;
    }

    out.push({
      orderIndex: order++,
      type,
      prompt: q.prompt,
      required: isRequired(q, type),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------

const byCode = new Map<string, { name: string; questions: SeedQ[] }>();

for (const src of SOURCES) {
  const parsed = JSON.parse(readFileSync(src, "utf8")) as { templates: ExtractedTemplate[] };
  for (const t of parsed.templates) {
    const code = CODE_BY_NAME[t.connecteamName];
    if (!code) {
      console.warn(`  ! no code mapped for "${t.connecteamName}" — skipped`);
      continue;
    }
    if (t.questions.length === 0) continue;
    const built = buildQuestions(t);
    const existing = byCode.get(code);
    // Two passes can both see a template; keep the fuller union.
    if (!existing || built.length > existing.questions.length) {
      byCode.set(code, { name: t.connecteamName, questions: built });
    }
  }
}

// 812 has no PM PA form in Connecteam at all -- 110 attachments enumerated,
// zero Smartsheet-wide. Kyle's call: duplicate a sibling. 8700 is one of the
// six that share the 22-question standard shape, so it is representative;
// 4645 deliberately is NOT used, it is the short one (no Transforming Spaces).
const DUP_SOURCE = "PPA8700";
if (!byCode.has("PPA812") && byCode.has(DUP_SOURCE)) {
  const src = byCode.get(DUP_SOURCE)!;
  byCode.set("PPA812", {
    name: `812 PM PA Checklist (copied from ${DUP_SOURCE} — no Connecteam source)`,
    questions: src.questions.map((q) => ({ ...q })),
  });
}

const codes = [...byCode.keys()].sort();

// The real Connecteam form name per code. The duplicated 812 entry carries a
// parenthetical explaining its provenance; strip it, since the NAME should read
// like the others -- the provenance lives in the code comment and the report.
const nameByCode = new Map<string, string>(
  codes.map((c) => [c, byCode.get(c)!.name.replace(/\s*\(copied from[^)]*\)/, "")]),
);
const codesForNames = codes;
const lines: string[] = [
  "// GENERATED by scripts/build-connecteam-questions.ts — do not hand-edit.",
  "//",
  "// Question sets extracted from the completed-checklist PDFs that Connecteam",
  "// files into Smartsheet. Every prompt is the operators' own wording, already",
  "// bilingual `English / Español` (ADR-013 field-staff Spanish, not machine",
  "// translated).",
  "//",
  "// ⚠ Every `type` is INFERRED from how the PDF rendered the field; Connecteam's",
  "// real field definitions were never visible. Treat them as a starting point a",
  "// Property Manager reviews before publishing.",
  "",
  'import { QuestionType } from "@prisma/client";',
  "",
  "export type ConnecteamQuestion = {",
  "  orderIndex: number;",
  "  type: QuestionType;",
  "  prompt: string;",
  "  hint?: string;",
  "  required: boolean;",
  "};",
  "",
  "/**",
  " * The form's ACTUAL name in Connecteam, keyed by our template code.",
  " *",
  " * Kept separate from the question sets because it answers a different",
  " * question: what the people filling this in already call it. Several of our",
  " * seeded names were inherited from Smartsheet SHEET names, which turned out",
  " * not to match any Connecteam form at all -- `HK Review` and",
  " * `Maintenance Report` are sheet names, not templates.",
  " */",
  "export const CONNECTEAM_NAMES: Record<string, string> = {",
  ...codesForNames.map((c) => `  ${JSON.stringify(c)}: ${JSON.stringify(nameByCode.get(c)!)},`),
  "};",
  "",
  "export const CONNECTEAM_QUESTIONS: Record<string, ConnecteamQuestion[]> = {",
];

for (const code of codes) {
  const t = byCode.get(code)!;
  lines.push(`  // ${t.name} — ${t.questions.length} questions`);
  lines.push(`  ${JSON.stringify(code)}: [`);
  for (const q of t.questions) {
    const parts = [
      `orderIndex: ${q.orderIndex}`,
      `type: QuestionType.${q.type}`,
      `prompt: ${JSON.stringify(q.prompt)}`,
      ...(q.hint ? [`hint: ${JSON.stringify(q.hint)}`] : []),
      `required: ${q.required}`,
    ];
    lines.push(`    { ${parts.join(", ")} },`);
  }
  lines.push("  ],");
}
lines.push("};", "");

mkdirSync("prisma/data", { recursive: true });
writeFileSync("prisma/data/connecteam-questions.ts", lines.join("\n"), "utf8");

const total = codes.reduce((n, c) => n + byCode.get(c)!.questions.length, 0);
console.log(`wrote prisma/data/connecteam-questions.ts`);
console.log(`${codes.length} templates, ${total} questions`);
for (const c of codes) {
  console.log(`  ${c.padEnd(10)} ${String(byCode.get(c)!.questions.length).padStart(3)}`);
}
