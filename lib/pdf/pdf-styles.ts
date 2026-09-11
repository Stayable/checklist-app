import { StyleSheet } from "@react-pdf/renderer";

/**
 * Stayable PDF design language, ported from the ops reporting kit
 * (`cloudbeds_dashboard/lib/ops-pdf-kit.ts`) on Kyle's call 2026-09-09:
 * "match it please".
 *
 * That kit is jsPDF and this is @react-pdf/renderer, so no code is portable —
 * only the tokens and the layout grammar. They are reproduced EXACTLY (the RGB
 * triples there are the hex values here) so a checklist export and an
 * occupancy report read as one system rather than two products.
 *
 * Deliberate departures from the ops kit, both because a checklist is a
 * different artefact from a dashboard report:
 *   * PORTRAIT, not landscape. A checklist is a form read top to bottom; the
 *     ops PDFs are wide tables.
 *   * No KPI tiles. A single submission has no metrics worth a tile row; the
 *     meta panel carries its facts instead.
 */

// ⚠ THIS FILE IS THE ONLY PLACE THE PDF GETS ITS COLOURS.
// @react-pdf/renderer never reads app/globals.css — it has its own StyleSheet —
// so the 2026-09-11 Elevate re-skin of the web app changed nothing here, and an
// export looked identical until these constants moved. Repointed 2026-09-11 so
// the exports stop diverging from the screens.
//
// Values come from the print set in docs/design/stayable-ops-redesign/tokens.css,
// which the designer deliberately made a NARROWER warm palette than the screen
// one: paper stays pure white and tints are held to panels and table headers,
// because a flooded cream ground bands on a cheap office laser and these
// documents genuinely get printed and handed to inspectors.

/** NAVY — title bar and table headers. Elevate navy. */
const NAVY = "#0B1F3A";
/** INK — body text. Elevate ink. */
const INK = "#1A1A1A";
/** MUTED — captions, footer, secondary meta. Elevate ink-3 (warm, not blue-gray). */
const MUTED = "#6E6960";
/** PANEL_BG — meta panel and zebra fills. `--se-print-panel`: a warm tint at
 *  ~3% ink, chosen to survive a laser rather than the screen's cream. */
const PANEL_BG = "#F4F1E9";
/** PANEL_BORDER — hairlines. `--se-print-rule`. */
const PANEL_BORDER = "#D9D2C2";
/** Page ground stays PURE WHITE by design — see the note above. */
const WHITE = "#FFFFFF";
/** Stayable sunshine. Brand accent only — never carries meaning on its own. */
const GOLD = "#FDDB24";
/** The readable yellow (`--se-sunshine-text`), matching the app's amber-800
 *  treatment of a submitter note. Replaces a red-brown that no longer had a
 *  counterpart on screen. */
const NOTE_INK = "#8C6700";
/** Header subtitle on the navy bar — Elevate sky-soft, was a cool #9FB4D1. */
const HEADER_SUB = "#B8E3F4";

export const palette = { NAVY, INK, MUTED, PANEL_BG, PANEL_BORDER, WHITE, GOLD, NOTE_INK, HEADER_SUB };

/** MARGIN 24pt, as the ops kit. */
const MARGIN = 24;
/** Header bar is 54pt there; portrait needs less furniture, so 48. */
export const HEADER_HEIGHT = 48;
const FOOTER_HEIGHT = 28;

export const styles = StyleSheet.create({
  // Padding clears the FIXED header and footer, which sit outside the flow and
  // would otherwise be painted over by page-two content.
  page: {
    paddingTop: HEADER_HEIGHT + 16,
    paddingBottom: FOOTER_HEIGHT + 12,
    paddingHorizontal: MARGIN,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: INK,
  },

  // ── header ────────────────────────────────────────────────────────────────
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: HEADER_HEIGHT,
    backgroundColor: NAVY,
    paddingHorizontal: MARGIN,
    paddingTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  wordmark: { color: WHITE, fontSize: 11, fontFamily: "Helvetica-Bold" },
  wordmarkAccent: { color: GOLD, fontSize: 11, fontFamily: "Helvetica-Bold" },
  headerTitle: { color: WHITE, fontSize: 13, fontFamily: "Helvetica-Bold", marginTop: 3 },
  headerRight: { color: HEADER_SUB, fontSize: 8, textAlign: "right" },
  // 2pt gold rule under the bar — the one place brand colour appears at size.
  headerRule: {
    position: "absolute",
    top: HEADER_HEIGHT,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: GOLD,
  },

  // ── footer ────────────────────────────────────────────────────────────────
  footer: {
    position: "absolute",
    bottom: 12,
    left: MARGIN,
    right: MARGIN,
    paddingTop: 6,
    borderTop: `0.5pt solid ${PANEL_BORDER}`,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: MUTED,
  },
  footerText: { fontSize: 7, color: MUTED },

  // ── meta panel ────────────────────────────────────────────────────────────
  metaPanel: {
    backgroundColor: PANEL_BG,
    border: `0.5pt solid ${PANEL_BORDER}`,
    borderRadius: 3,
    padding: 10,
    marginBottom: 14,
    flexDirection: "row",
    flexWrap: "wrap",
  },
  metaItem: { width: "33%", paddingRight: 8, marginBottom: 4 },
  metaLabel: { fontSize: 6.5, color: MUTED, textTransform: "uppercase", letterSpacing: 0.6 },
  metaValue: { fontSize: 9, color: INK, marginTop: 1 },

  // ── question blocks ───────────────────────────────────────────────────────
  sectionHeading: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: WHITE,
    backgroundColor: NAVY,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginTop: 10,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  qBlock: {
    marginBottom: 9,
    borderBottom: `0.5pt solid ${PANEL_BORDER}`,
    paddingBottom: 7,
  },
  prompt: { fontFamily: "Helvetica-Bold", fontSize: 9.5, marginBottom: 2 },
  hint: { fontSize: 7.5, color: MUTED, marginBottom: 2 },
  answer: { color: INK, fontSize: 9.5 },
  // The submitter's note to the reviewer: commentary ON the answer, not part
  // of it, so it is indented behind a rule rather than sitting inline.
  submitterNote: {
    color: NOTE_INK,
    fontSize: 8.5,
    marginTop: 4,
    paddingLeft: 8,
    borderLeft: `1.5pt solid ${GOLD}`,
  },

  // ── media ─────────────────────────────────────────────────────────────────
  photoRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 5 },
  photo: { width: 118, height: 118, objectFit: "cover", border: `0.5pt solid ${PANEL_BORDER}` },
  photoCap: { fontSize: 6.5, color: MUTED, width: 118, marginTop: 2 },
  signature: { width: 160, height: 60, marginTop: 4, border: `0.5pt solid ${PANEL_BORDER}` },

  // ── tables (kept for the other PDFs in this folder) ───────────────────────
  h1: { fontSize: 15, fontFamily: "Helvetica-Bold", marginBottom: 2, color: INK },
  meta: { fontSize: 9, color: MUTED, marginBottom: 12 },
  tableHead: {
    flexDirection: "row",
    backgroundColor: NAVY,
    color: WHITE,
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
  },
  row: { flexDirection: "row", borderBottom: `0.5pt solid ${PANEL_BORDER}`, fontSize: 8 },
  cell: { padding: 4, flex: 1 },
});
