/**
 * Render the checklist PDF to a file from fabricated data, to look at the
 * design without needing R2, a database, or a real submission.
 *
 * Run: pnpm tsx scripts/render-sample-checklist-pdf.ts [out.pdf]
 *
 * Deliberately covers the cases that break a layout rather than a tidy one:
 * long prompts, a section divider, a repeated CHECKPOINT prompt separated only
 * by its hint, a 2000-ish character submitter note, a Fail verdict with a
 * reviewer note, and enough questions to force a SECOND PAGE — which is the
 * only way to prove the fixed header and the "Page X of Y" footer actually
 * repeat.
 *
 * No photos: those need presigned R2 URLs. Photo layout is unchanged by this
 * redesign apart from the border, so it is not what needs eyes on it.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ChecklistPdf, type PdfResponse } from "../lib/pdf/ChecklistPdf";
import { renderPdfToBuffer } from "../lib/pdf/render";

const LONG_NOTE =
  "Bathroom was signed off as complete but the photos show the tub was not scrubbed and there is still hair in the drain. The toilet paper holder is empty in photo 4.\n\n" +
  "Please redo the bathroom before end of shift and re-take all four bathroom photos. If the drain is blocked rather than dirty, raise it with maintenance instead of re-cleaning.";

function q(
  prompt: string,
  answerText: string,
  extra: Partial<PdfResponse> = {},
): PdfResponse {
  return {
    prompt,
    type: "SHORT_TEXT",
    answerText,
    note: null,
    signatureUrl: null,
    photos: [],
    ...extra,
  };
}

const responses: PdfResponse[] = [
  { ...q("Tasks", ""), type: "SECTION_DIVIDER" },
  q("Property Attendant / Asistente de propiedad", "Randy"),
  q("Empty Property Garbage Cans / Vaciar botes de basura", "PASS"),
  q(
    "Pick Up Trash From Parking Lot and Property Perimeter / Recoja la basura del estacionamiento y del perimetro de la propiedad",
    "FAIL",
    { note: "Dumpster area was still blocked by the contractor's truck at end of shift." },
  ),
  { ...q("Checkpoints", ""), type: "SECTION_DIVIDER" },
  q("CHECKPOINT 1: Take a photo of the front of lobby building", "1 photo", {
    type: "PHOTO",
    hint: "7:00pm",
  }),
  q("CHECKPOINT 1: Take a photo of the front of lobby building", "1 photo", {
    type: "PHOTO",
    hint: "10:00pm",
  }),
  q("CHECKPOINT 1: Take a photo of the front of lobby building", "1 photo", {
    type: "PHOTO",
    hint: "End of shift",
  }),
  q("Notes/Comments:", "Pool gate latch is sticking again.", { type: "LONG_TEXT" }),
  q("Was the bathroom cleaned to standard?", "No", { type: "YESNO", note: LONG_NOTE }),
  // Bulk, purely to push onto a second page so the fixed furniture is provable.
  ...Array.from({ length: 22 }, (_, i) =>
    q(`Routine check item ${i + 1} — walkways, lighting and signage`, i % 3 === 0 ? "FAIL" : "PASS", {
      type: "PASSFAIL",
    }),
  ),
];

async function main() {
  const out = process.argv[2] ?? "outputs/pdf-previews/sample-checklist.pdf";
  mkdirSync(dirname(out), { recursive: true });
  const buffer = await renderPdfToBuffer(
    ChecklistPdf({
      data: {
        title: "2295 PM PA Checklist KE Randy 090926",
        propertyLabel: "KE — Kissimmee East",
        unit: null,
        assignee: "Randy",
        startedAt: "Sep 9, 2026 6:58 PM ET",
        completedAt: "Sep 9, 2026 11:12 PM ET",
        timeToComplete: "4h 14m",
        generatedAt: "Sep 9, 2026 1:42 PM ET",
        systemId: "CL-2295-PPA2295-20260909-001",
        completionCheck: "FAIL",
        reviewedBy: "Karla Dugayo",
        reviewerNote:
          "Two checkpoint rounds are missing photos and the dumpster area was not cleared. Please redo tomorrow and flag the contractor truck to the PM if it blocks access again.",
        responses,
      },
    }),
  );
  writeFileSync(out, buffer);
  console.log(`wrote ${out}  (${(buffer.length / 1024).toFixed(1)} KB, ${responses.length} rows)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
