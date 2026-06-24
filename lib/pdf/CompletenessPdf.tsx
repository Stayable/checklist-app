import { Document, Page, Text, View } from "@react-pdf/renderer";
import { styles } from "./pdf-styles";
import type { CompletenessRow } from "@/lib/reports";

export function CompletenessPdf({
  rows,
  codeById,
  title,
}: {
  rows: CompletenessRow[];
  codeById: Record<string, string>;
  title: string;
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page} orientation="landscape">
        <Text style={styles.h1}>{title}</Text>
        <View style={styles.tableHead}>
          {["Date", "Property", "Scheduled", "Complete", "Incomplete", "With issues", "%"].map((h) => (
            <Text key={h} style={styles.cell}>{h}</Text>
          ))}
        </View>
        {rows.map((r) => (
          <View key={`${r.propertyId}|${r.date}`} style={styles.row}>
            <Text style={styles.cell}>{r.date}</Text>
            <Text style={styles.cell}>{codeById[r.propertyId] ?? r.propertyId}</Text>
            <Text style={styles.cell}>{String(r.scheduled)}</Text>
            <Text style={styles.cell}>{String(r.completed)}</Text>
            <Text style={styles.cell}>{String(r.incomplete)}</Text>
            <Text style={styles.cell}>{String(r.withIssues)}</Text>
            <Text style={styles.cell}>{r.pct}%</Text>
          </View>
        ))}
      </Page>
    </Document>
  );
}
