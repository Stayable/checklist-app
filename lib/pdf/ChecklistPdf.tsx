import { Document, Page, Text, View, Image } from "@react-pdf/renderer";
import { styles } from "./pdf-styles";

export type PdfPhoto = {
  url: string;
  capturedAt: string | null;
  geofence: string;
  coords: string | null;
};

export type PdfResponse = {
  prompt: string;
  type: string;
  /** Sub-label under the prompt — the only thing telling repeated prompts apart. */
  hint?: string | null;
  answerText: string;
  /** ADR-037: the submitter's note to the reviewer, if they left one. */
  note: string | null;
  signatureUrl: string | null;
  photos: PdfPhoto[];
};

export type ChecklistPdfData = {
  title: string;
  propertyLabel: string;
  unit: string | null;
  assignee: string;
  startedAt: string | null;
  completedAt: string | null;
  /**
   * Elapsed fill time, already formatted ("1h 05m", or "—" when the checklist
   * was never opened or never submitted). Pre-formatted rather than a number so
   * the PDF, the review queue and the checklist board all print the string that
   * `lib/review.formatMinutes` produced — an exported PDF that rounded
   * differently from the screen it was exported from would be worse than
   * useless in a dispute.
   */
  timeToComplete: string;
  /** ET stamp for the footer, e.g. "Sep 9, 2026 1:42 PM ET". Formatted by the
   *  caller through lib/datetime so this component never touches a date. */
  generatedAt: string;
  /** ADR-009 system id — the join key, printed so a paper copy is traceable. */
  systemId?: string | null;
  /** Review outcome, when there is one. */
  completionCheck?: "PASS" | "FAIL" | null;
  reviewedBy?: string | null;
  reviewerNote?: string | null;
  responses: PdfResponse[];
};

/**
 * Stayable-branded checklist export.
 *
 * Header and footer are `fixed`, so they repeat on every page — that is the
 * whole point of the redesign: an unbranded, unpaginated export is unusable as
 * evidence the moment it is printed, emailed on, or dropped in a folder.
 * `render={({ pageNumber, totalPages })}` is react-pdf's only way to number
 * pages, and it requires the fixed footer to live outside the flow.
 */
export function ChecklistPdf({ data }: { data: ChecklistPdfData }) {
  const meta: { label: string; value: string }[] = [
    { label: "Property", value: data.propertyLabel },
    ...(data.unit ? [{ label: "Unit", value: data.unit }] : []),
    { label: "Completed by", value: data.assignee },
    { label: "Started", value: data.startedAt ?? "—" },
    { label: "Completed", value: data.completedAt ?? "—" },
    { label: "Time to complete", value: data.timeToComplete },
    ...(data.completionCheck
      ? [{ label: "Completion check", value: data.completionCheck === "PASS" ? "Pass" : "Fail" }]
      : []),
    ...(data.reviewedBy ? [{ label: "Reviewed by", value: data.reviewedBy }] : []),
  ];

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header} fixed>
          <View>
            <Text>
              <Text style={styles.wordmark}>Stayable </Text>
              <Text style={styles.wordmarkAccent}>Operations</Text>
            </Text>
            <Text style={styles.headerTitle}>{data.title}</Text>
          </View>
          <Text style={styles.headerRight}>
            {data.systemId ? `${data.systemId}\n` : ""}
            {`As of ${data.generatedAt}`}
          </Text>
        </View>
        <View style={styles.headerRule} fixed />

        <View style={styles.metaPanel}>
          {meta.map((m) => (
            <View key={m.label} style={styles.metaItem}>
              <Text style={styles.metaLabel}>{m.label}</Text>
              <Text style={styles.metaValue}>{m.value}</Text>
            </View>
          ))}
        </View>

        {data.reviewerNote ? (
          <View style={styles.qBlock} wrap={false}>
            <Text style={styles.prompt}>Reviewer note</Text>
            <Text style={styles.submitterNote}>{data.reviewerNote}</Text>
          </View>
        ) : null}

        {data.responses.map((r, i) =>
          // A divider is a heading, not a question — it carries no answer and
          // must not render an empty bordered block.
          r.type === "SECTION_DIVIDER" ? (
            <Text key={i} style={styles.sectionHeading}>
              {r.prompt}
            </Text>
          ) : (
            <View key={i} style={styles.qBlock} wrap={false}>
              <Text style={styles.prompt}>{r.prompt}</Text>
              {r.hint ? <Text style={styles.hint}>{r.hint}</Text> : null}
              {r.answerText ? <Text style={styles.answer}>{r.answerText}</Text> : null}
              {r.note ? (
                <Text style={styles.submitterNote}>Note from submitter: {r.note}</Text>
              ) : null}
              {r.signatureUrl ? (
                // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop
                <Image style={styles.signature} src={r.signatureUrl} />
              ) : null}
              {r.photos.length > 0 ? (
                <View style={styles.photoRow}>
                  {r.photos.map((p, j) => (
                    <View key={j}>
                      {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop */}
                      <Image style={styles.photo} src={p.url} />
                      <Text style={styles.photoCap}>
                        {[p.geofence, p.capturedAt, p.coords].filter(Boolean).join(" · ")}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ),
        )}

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            Stayable Operations · Generated {data.generatedAt}
          </Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
