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
  responses: PdfResponse[];
};

export function ChecklistPdf({ data }: { data: ChecklistPdfData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.h1}>{data.title}</Text>
        <Text style={styles.meta}>
          {data.propertyLabel}
          {data.unit ? ` · Unit ${data.unit}` : ""} · Assignee: {data.assignee}
          {"\n"}Started: {data.startedAt ?? "—"}{"   "}Completed: {data.completedAt ?? "—"}
          {"   "}Time to complete: {data.timeToComplete}
        </Text>
        {data.responses.map((r, i) => (
          <View key={i} style={styles.qBlock} wrap={false}>
            <Text style={styles.prompt}>{r.prompt}</Text>
            {r.answerText ? <Text style={styles.answer}>{r.answerText}</Text> : null}
            {r.note ? (
              <Text style={styles.submitterNote}>Note from submitter: {r.note}</Text>
            ) : null}
            {r.signatureUrl ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop
              <Image style={{ width: 160, height: 60, marginTop: 4 }} src={r.signatureUrl} />
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
        ))}
      </Page>
    </Document>
  );
}
