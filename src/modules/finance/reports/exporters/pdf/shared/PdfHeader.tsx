import { View, Text, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  header: {
    marginBottom: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#0066FF",
  },
  brand: { fontSize: 16, fontWeight: "bold", color: "#0066FF", marginBottom: 2 },
  meta: {
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: "#6B7585",
  },
  title: { fontSize: 11, fontWeight: "bold", color: "#0F141B", marginTop: 6 },
  subtitle: { fontSize: 8, color: "#6B7585" },
});

export interface PdfHeaderProps {
  title: string;
  subtitle: string;
  tenantName: string;
  period: string;
  generatedAt: string;
}

export function PdfHeader({
  title,
  subtitle,
  tenantName,
  period,
  generatedAt,
}: PdfHeaderProps) {
  return (
    <View style={styles.header}>
      <Text style={styles.brand}>OPAI · Finanzas</Text>
      <View style={styles.meta}>
        <Text>{tenantName}</Text>
        <Text>Generado: {generatedAt}</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>
        {subtitle} · {period}
      </Text>
    </View>
  );
}

export const sharedStyles = StyleSheet.create({
  page: { padding: 28, fontSize: 8, fontFamily: "Helvetica" },
  table: { marginTop: 4 },
  thead: { flexDirection: "row", backgroundColor: "#0066FF", padding: 4 },
  theadCell: { color: "#FFFFFF", fontSize: 7, fontWeight: "bold" },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#E2E8F0",
    padding: 3,
  },
  totalRow: {
    flexDirection: "row",
    backgroundColor: "#E5EDFF",
    padding: 4,
    marginTop: 2,
  },
  cell: { fontSize: 7, color: "#0F141B" },
  cellRight: { fontSize: 7, color: "#0F141B", textAlign: "right" },
  totalCell: { fontSize: 8, fontWeight: "bold", color: "#0066FF" },
  totalCellRight: { fontSize: 8, fontWeight: "bold", color: "#0066FF", textAlign: "right" },
  sectionTitle: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#0066FF",
    marginTop: 8,
    marginBottom: 2,
  },
  footer: {
    position: "absolute",
    bottom: 16,
    left: 28,
    right: 28,
    fontSize: 6,
    color: "#94A3B8",
    textAlign: "center",
    paddingTop: 6,
    borderTopWidth: 0.5,
    borderTopColor: "#E2E8F0",
  },
});

export const fmtCLP = (n: number): string =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(n);
