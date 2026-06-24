import { Document, Page, Text, View } from "@react-pdf/renderer";
import { styles } from "./pdf-styles";

export type IssuePdfRow = {
  title: string;
  checklist: string;
  property: string;
  room: string;
  priority: string;
  status: string;
  created: string;
  sla: string;
};

export function IssuesPdf({
  rows,
  title,
}: {
  rows: IssuePdfRow[];
  title: string;
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page} orientation="landscape">
        <Text style={styles.h1}>{title}</Text>
        <View style={styles.tableHead}>
          {["Issue", "From checklist", "Property", "Room", "Priority", "Status", "Created", "SLA"].map((h) => (
            <Text key={h} style={styles.cell}>{h}</Text>
          ))}
        </View>
        {rows.map((r, i) => (
          <View key={i} style={styles.row}>
            <Text style={styles.cell}>{r.title}</Text>
            <Text style={styles.cell}>{r.checklist}</Text>
            <Text style={styles.cell}>{r.property}</Text>
            <Text style={styles.cell}>{r.room}</Text>
            <Text style={styles.cell}>{r.priority}</Text>
            <Text style={styles.cell}>{r.status}</Text>
            <Text style={styles.cell}>{r.created}</Text>
            <Text style={styles.cell}>{r.sla}</Text>
          </View>
        ))}
      </Page>
    </Document>
  );
}
