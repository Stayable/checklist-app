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
        </Text>
        {data.responses.map((r, i) => (
          <View key={i} style={styles.qBlock} wrap={false}>
            <Text style={styles.prompt}>{r.prompt}</Text>
            {r.answerText ? <Text style={styles.answer}>{r.answerText}</Text> : null}
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
