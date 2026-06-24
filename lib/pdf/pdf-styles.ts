import { StyleSheet } from "@react-pdf/renderer";

export const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica", color: "#0f172a" },
  h1: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  meta: { fontSize: 9, color: "#475569", marginBottom: 12 },
  qBlock: { marginBottom: 10, borderBottom: "1pt solid #e2e8f0", paddingBottom: 8 },
  prompt: { fontFamily: "Helvetica-Bold", marginBottom: 2 },
  answer: { color: "#334155" },
  photoRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  photo: { width: 120, height: 120, objectFit: "cover", border: "1pt solid #e2e8f0" },
  photoCap: { fontSize: 7, color: "#64748b", width: 120 },
  tableHead: { flexDirection: "row", backgroundColor: "#f1f5f9", fontFamily: "Helvetica-Bold", fontSize: 8 },
  row: { flexDirection: "row", borderBottom: "0.5pt solid #e2e8f0", fontSize: 8 },
  cell: { padding: 4, flex: 1 },
});
