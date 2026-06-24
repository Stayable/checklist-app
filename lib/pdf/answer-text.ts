import { formatDateInET } from "@/lib/datetime";

// Flattens a stored response answer (JSON, type-dependent) to display text for the PDF.
// Mirrors the AnswerView component in app/review/[id]/page.tsx — per-type rendering:
//   PASSFAIL  → "PASS" | "FAIL" (String cast)
//   YESNO     → "Yes" | "No"
//   MULTI     → comma-joined array
//   PHOTO     → "{n} photo(s)" (photos rendered separately in ChecklistPdf)
//   SIGNATURE → "" (image rendered separately in ChecklistPdf)
//   SINGLE    → String(answer) [default branch in review page]
//   NUMBER    → String(answer) [default branch]
//   DATE      → formatted via formatDateInET [default branch calls String; we upgrade to ET format]
//   SHORT_TEXT / LONG_TEXT → String(answer) [default branch]
//   SECTION_DIVIDER → not a response question; excluded at call site
// Keep this a pure function so it can be unit-tested.
export function answerToText(type: string, answer: unknown): string {
  if (answer == null) return "—";
  switch (type) {
    case "PASSFAIL":
      return String(answer); // "PASS" or "FAIL"
    case "YESNO":
      return answer ? "Yes" : "No";
    case "MULTI":
      return Array.isArray(answer) ? (answer as string[]).join(", ") : String(answer);
    case "PHOTO": {
      const count = (answer as { count?: number })?.count ?? 0;
      return `${count} photo${count === 1 ? "" : "s"}`;
    }
    case "SIGNATURE":
      return ""; // rendered as image in ChecklistPdf
    case "DATE":
      // answer may be an ISO string or a date-like value stored as string
      try {
        return formatDateInET(String(answer));
      } catch {
        return String(answer);
      }
    default:
      // SINGLE, NUMBER, SHORT_TEXT, LONG_TEXT — straight string cast
      // (mirrors review page default: String(answer))
      if (typeof answer === "object") return JSON.stringify(answer);
      return String(answer);
  }
}
