import { Document, Page, Text, View, StyleSheet, Image as PDFImage } from "@react-pdf/renderer";

interface PdfTotals {
  total: number;
  completadas: number;
  incompletas: number;
  noRealizadas: number;
  compliance: number;
  trustPromedio: number;
}

interface PdfRow {
  scheduledAt: string;
  installation: string;
  template: string;
  guardia: string;
  status: string;
  porcentajeCompletado: number;
  trustScore: number;
  durationMinutes: number | null;
  checkpointsCompletados: number;
  checkpointsTotal: number;
}

interface Props {
  totals: PdfTotals;
  rows: PdfRow[];
  dateRange: string;
  chartImageBase64?: string | null;
  companyName?: string;
}

const STATUS_LABELS: Record<string, string> = {
  completada: "Completada",
  incompleta: "Incompleta",
  no_realizada: "No realizada",
  pendiente: "Pendiente",
  en_curso: "En curso",
};

const styles = StyleSheet.create({
  page: {
    padding: 32,
    backgroundColor: "#ffffff",
    fontFamily: "Helvetica",
    fontSize: 9,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: "#14b8a6",
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#0f172a",
  },
  subtitle: {
    fontSize: 10,
    color: "#64748b",
    marginTop: 2,
  },
  dateRange: {
    fontSize: 9,
    color: "#64748b",
    textAlign: "right",
  },
  kpiRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  kpiCard: {
    flex: 1,
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    alignItems: "center",
  },
  kpiLabel: {
    fontSize: 7,
    color: "#64748b",
    textTransform: "uppercase",
    marginBottom: 3,
  },
  kpiValue: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#0f172a",
  },
  chartImage: {
    width: "100%",
    height: 200,
    marginBottom: 16,
    borderRadius: 4,
    objectFit: "contain",
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#0f172a",
    marginBottom: 8,
    marginTop: 4,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#f1f5f9",
  },
  tableRowAlt: {
    backgroundColor: "#fafafa",
  },
  thCell: {
    fontSize: 7,
    fontWeight: "bold",
    color: "#475569",
    textTransform: "uppercase",
  },
  tdCell: {
    fontSize: 8,
    color: "#334155",
  },
  colDate: { width: "12%" },
  colInst: { width: "16%" },
  colTpl: { width: "14%" },
  colGuard: { width: "14%" },
  colStatus: { width: "12%" },
  colComp: { width: "8%", textAlign: "right" },
  colTrust: { width: "8%", textAlign: "right" },
  colDur: { width: "8%", textAlign: "right" },
  colCp: { width: "8%", textAlign: "center" },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 32,
    right: 32,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: "#94a3b8",
  },
});

export function RondasReportPDF({ totals, rows, dateRange, chartImageBase64, companyName }: Props) {
  const pageRows = 28;
  const pages: PdfRow[][] = [];
  for (let i = 0; i < rows.length; i += pageRows) {
    pages.push(rows.slice(i, i + pageRows));
  }
  if (pages.length === 0) pages.push([]);

  const now = new Date().toLocaleDateString("es-CL", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Reportes de Rondas</Text>
            <Text style={styles.subtitle}>
              Cumplimiento, cobertura y confiabilidad
            </Text>
          </View>
          <View>
            <Text style={styles.dateRange}>{dateRange}</Text>
            <Text style={[styles.dateRange, { marginTop: 2 }]}>Generado: {now}</Text>
          </View>
        </View>

        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Total rondas</Text>
            <Text style={styles.kpiValue}>{totals.total}</Text>
          </View>
          <View style={[styles.kpiCard, { borderColor: "#22c55e" }]}>
            <Text style={styles.kpiLabel}>Completadas</Text>
            <Text style={[styles.kpiValue, { color: "#16a34a" }]}>{totals.completadas}</Text>
          </View>
          <View style={[styles.kpiCard, { borderColor: "#f59e0b" }]}>
            <Text style={styles.kpiLabel}>Incompletas</Text>
            <Text style={[styles.kpiValue, { color: "#d97706" }]}>{totals.incompletas}</Text>
          </View>
          <View style={[styles.kpiCard, { borderColor: "#ef4444" }]}>
            <Text style={styles.kpiLabel}>No realizadas</Text>
            <Text style={[styles.kpiValue, { color: "#dc2626" }]}>{totals.noRealizadas}</Text>
          </View>
          <View style={[styles.kpiCard, { borderColor: "#22c55e" }]}>
            <Text style={styles.kpiLabel}>Cumplimiento</Text>
            <Text style={[styles.kpiValue, { color: "#16a34a" }]}>{totals.compliance}%</Text>
          </View>
          <View style={[styles.kpiCard, { borderColor: "#3b82f6" }]}>
            <Text style={styles.kpiLabel}>Trust promedio</Text>
            <Text style={[styles.kpiValue, { color: "#2563eb" }]}>{totals.trustPromedio}</Text>
          </View>
        </View>

        {chartImageBase64 && (
          <PDFImage src={chartImageBase64} style={styles.chartImage} />
        )}

        <Text style={styles.sectionTitle}>Detalle de rondas</Text>

        <View style={styles.tableHeader}>
          <Text style={[styles.thCell, styles.colDate]}>Fecha</Text>
          <Text style={[styles.thCell, styles.colInst]}>Instalación</Text>
          <Text style={[styles.thCell, styles.colTpl]}>Plantilla</Text>
          <Text style={[styles.thCell, styles.colGuard]}>Guardia</Text>
          <Text style={[styles.thCell, styles.colStatus]}>Estado</Text>
          <Text style={[styles.thCell, styles.colComp]}>Cump%</Text>
          <Text style={[styles.thCell, styles.colTrust]}>Trust</Text>
          <Text style={[styles.thCell, styles.colDur]}>Dur.</Text>
          <Text style={[styles.thCell, styles.colCp]}>CP</Text>
        </View>

        {pages[0].map((row, i) => (
          <View key={i} style={[styles.tableRow, ...(i % 2 === 1 ? [styles.tableRowAlt] : [])]}>
            <Text style={[styles.tdCell, styles.colDate]}>
              {new Date(row.scheduledAt).toLocaleDateString("es-CL", { day: "2-digit", month: "short" })}
            </Text>
            <Text style={[styles.tdCell, styles.colInst]}>{row.installation}</Text>
            <Text style={[styles.tdCell, styles.colTpl]}>{row.template}</Text>
            <Text style={[styles.tdCell, styles.colGuard]}>{row.guardia || "—"}</Text>
            <Text style={[styles.tdCell, styles.colStatus]}>{STATUS_LABELS[row.status] ?? row.status}</Text>
            <Text style={[styles.tdCell, styles.colComp]}>{Math.round(row.porcentajeCompletado)}%</Text>
            <Text style={[styles.tdCell, styles.colTrust]}>{row.trustScore}</Text>
            <Text style={[styles.tdCell, styles.colDur]}>{row.durationMinutes ?? "—"}</Text>
            <Text style={[styles.tdCell, styles.colCp]}>
              {row.checkpointsCompletados}/{row.checkpointsTotal}
            </Text>
          </View>
        ))}

        <View style={styles.footer} fixed>
          <Text>OPAI — {companyName || "Gard Security"}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>

      {pages.slice(1).map((pageRows, pi) => (
        <Page key={pi + 1} size="A4" orientation="landscape" style={styles.page}>
          <View style={styles.tableHeader}>
            <Text style={[styles.thCell, styles.colDate]}>Fecha</Text>
            <Text style={[styles.thCell, styles.colInst]}>Instalación</Text>
            <Text style={[styles.thCell, styles.colTpl]}>Plantilla</Text>
            <Text style={[styles.thCell, styles.colGuard]}>Guardia</Text>
            <Text style={[styles.thCell, styles.colStatus]}>Estado</Text>
            <Text style={[styles.thCell, styles.colComp]}>Cump%</Text>
            <Text style={[styles.thCell, styles.colTrust]}>Trust</Text>
            <Text style={[styles.thCell, styles.colDur]}>Dur.</Text>
            <Text style={[styles.thCell, styles.colCp]}>CP</Text>
          </View>

          {pageRows.map((row, i) => (
            <View key={i} style={[styles.tableRow, ...(i % 2 === 1 ? [styles.tableRowAlt] : [])]}>
              <Text style={[styles.tdCell, styles.colDate]}>
                {new Date(row.scheduledAt).toLocaleDateString("es-CL", { day: "2-digit", month: "short" })}
              </Text>
              <Text style={[styles.tdCell, styles.colInst]}>{row.installation}</Text>
              <Text style={[styles.tdCell, styles.colTpl]}>{row.template}</Text>
              <Text style={[styles.tdCell, styles.colGuard]}>{row.guardia || "—"}</Text>
              <Text style={[styles.tdCell, styles.colStatus]}>{STATUS_LABELS[row.status] ?? row.status}</Text>
              <Text style={[styles.tdCell, styles.colComp]}>{Math.round(row.porcentajeCompletado)}%</Text>
              <Text style={[styles.tdCell, styles.colTrust]}>{row.trustScore}</Text>
              <Text style={[styles.tdCell, styles.colDur]}>{row.durationMinutes ?? "—"}</Text>
              <Text style={[styles.tdCell, styles.colCp]}>
                {row.checkpointsCompletados}/{row.checkpointsTotal}
              </Text>
            </View>
          ))}

          <View style={styles.footer} fixed>
            <Text>OPAI — {companyName || "Gard Security"}</Text>
            <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
          </View>
        </Page>
      ))}
    </Document>
  );
}
