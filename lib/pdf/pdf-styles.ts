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

/** NAVY [15,30,51] — title bar and table headers. */
const NAVY = "#0F1E33";
/** INK [30,30,30] — body text. Warmer than the slate this file used before. */
const INK = "#1E1E1E";
/** MUTED [100,105,115] — captions, footer, secondary meta. */
const MUTED = "#646973";
/** PANEL_BG [244,245,247] — meta panel and zebra fills. */
const PANEL_BG = "#F4F5F7";
/** PANEL_BORDER [210,213,219] — hairlines. */
const PANEL_BORDER = "#D2D5DB";
const WHITE = "#FFFFFF";
/** Stayable gold. Brand accent only — never carries meaning on its own. */
const GOLD = "#FDDA24";
/** Amber, matching the on-screen treatment of a submitter note. */
const NOTE_INK = "#78350F";

export const palette = { NAVY, INK, MUTED, PANEL_BG, PANEL_BORDER, WHITE, GOLD, NOTE_INK };

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
  headerRight: { color: "#9FB4D1", fontSize: 8, textAlign: "right" },
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
