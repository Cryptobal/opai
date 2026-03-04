import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 40, backgroundColor: "#FFFFFF", fontFamily: "Helvetica" },
  header: { marginBottom: 20 },
  title: { fontSize: 18, fontWeight: "bold", color: "#1e40af" },
  subtitle: { fontSize: 11, color: "#6b7280", marginTop: 4 },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 20 },
  kpiCard: {
    width: "45%",
    padding: 12,
    backgroundColor: "#f1f5f9",
    borderRadius: 6,
  },
  kpiLabel: { fontSize: 9, color: "#6b7280", marginBottom: 4 },
  kpiValue: { fontSize: 20, fontWeight: "bold", color: "#1e293b" },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    fontSize: 8,
    color: "#94a3b8",
    textAlign: "center",
  },
});

export interface ReporteData {
  period: string;
  installationName: string;
  accountName: string;
  compliance: number;
  completedRounds: number;
  totalRounds: number;
  asistencia: number;
  tickets: number;
  alertas: number;
}

export function ReportePDF({ data }: { data: ReporteData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Reporte Mensual — {data.period}</Text>
          <Text style={styles.subtitle}>
            {data.installationName} · {data.accountName}
          </Text>
        </View>
        <View style={styles.kpiGrid}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Cumplimiento Rondas</Text>
            <Text style={styles.kpiValue}>{data.compliance}%</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Rondas Completadas</Text>
            <Text style={styles.kpiValue}>
              {data.completedRounds}/{data.totalRounds}
            </Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Asistencia</Text>
            <Text style={styles.kpiValue}>{data.asistencia}%</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Tickets</Text>
            <Text style={styles.kpiValue}>{data.tickets}</Text>
          </View>
        </View>
        <Text style={styles.footer}>Generado por OPAI · Gard Security</Text>
      </Page>
    </Document>
  );
}
