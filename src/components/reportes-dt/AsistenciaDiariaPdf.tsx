import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 8, fontFamily: "Helvetica" },
  header: { marginBottom: 16 },
  title: { fontSize: 13, fontWeight: "bold", color: "#1e3a5f", marginBottom: 4 },
  subtitle: { fontSize: 8, color: "#64748b" },
  table: { marginTop: 8 },
  thead: { flexDirection: "row", backgroundColor: "#1e3a5f", padding: 4 },
  theadCell: { color: "#ffffff", fontSize: 7, fontWeight: "bold" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0", padding: 3 },
  rowAlt: { backgroundColor: "#f8fafc" },
  cell: { fontSize: 7, color: "#0f172a" },
  modBadge: { fontSize: 6, color: "#d97706", backgroundColor: "#fffbeb", padding: 1, borderRadius: 2 },
  footer: { marginTop: 16, fontSize: 6, color: "#94a3b8", borderTopWidth: 0.5, borderTopColor: "#e2e8f0", paddingTop: 8 },
});

const COL_WIDTHS = ["10%", "11%", "13%", "12%", "18%", "8%", "8%", "7%", "7%", "6%"];
const HEADERS = ["Fecha", "RUT", "Apellido", "Nombre", "Instalación", "Entrada", "Salida", "H.Norm", "H.Extra", "Mod."];

function fmtHora(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" });
}

export function AsistenciaDiariaPdf({ records, from, to }: {
  records: Array<{
    date: Date;
    attendanceStatus: string;
    checkInAt: Date | null;
    checkOutAt: Date | null;
    workedMinutes: number | null;
    overtimeMinutes: number | null;
    plannedGuardia: { persona: { firstName: string; lastName: string; rut: string | null } } | null;
    installation: { name: string };
    puesto: { name: string } | null;
    marcacionEntrada: { timestamp: Date; isModified: boolean; atrasoMinutos: number | null } | null;
    marcacionSalida: { timestamp: Date; isModified: boolean } | null;
  }>;
  from: string;
  to: string;
}) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Reporte de Asistencia Diaria</Text>
          <Text style={styles.subtitle}>Res. Exenta N°38 — DT Chile · Período: {from} — {to}</Text>
        </View>
        <View style={styles.table}>
          <View style={styles.thead}>
            {HEADERS.map((h, i) => (
              <Text key={h} style={[styles.theadCell, { width: COL_WIDTHS[i] }]}>{h}</Text>
            ))}
          </View>
          {records.map((r, idx) => {
            const isModified = r.marcacionEntrada?.isModified || r.marcacionSalida?.isModified;
            return (
              <View key={idx} style={[styles.row, idx % 2 === 1 ? styles.rowAlt : {}]}>
                <Text style={[styles.cell, { width: COL_WIDTHS[0] }]}>
                  {new Date(r.date).toLocaleDateString("es-CL")}
                </Text>
                <Text style={[styles.cell, { width: COL_WIDTHS[1] }]}>{r.plannedGuardia?.persona.rut ?? ""}</Text>
                <Text style={[styles.cell, { width: COL_WIDTHS[2] }]}>{r.plannedGuardia?.persona.lastName ?? ""}</Text>
                <Text style={[styles.cell, { width: COL_WIDTHS[3] }]}>{r.plannedGuardia?.persona.firstName ?? ""}</Text>
                <Text style={[styles.cell, { width: COL_WIDTHS[4] }]}>{r.installation.name}</Text>
                <Text style={[styles.cell, { width: COL_WIDTHS[5] }]}>
                  {fmtHora(r.marcacionEntrada?.timestamp ?? r.checkInAt)}
                </Text>
                <Text style={[styles.cell, { width: COL_WIDTHS[6] }]}>
                  {fmtHora(r.marcacionSalida?.timestamp ?? r.checkOutAt)}
                </Text>
                <Text style={[styles.cell, { width: COL_WIDTHS[7] }]}>
                  {r.workedMinutes ? (r.workedMinutes / 60).toFixed(1) : "—"}
                </Text>
                <Text style={[styles.cell, { width: COL_WIDTHS[8] }]}>
                  {r.overtimeMinutes ? (r.overtimeMinutes / 60).toFixed(1) : "—"}
                </Text>
                <Text style={[isModified ? styles.modBadge : styles.cell, { width: COL_WIDTHS[9] }]}>
                  {isModified ? "MOD" : "—"}
                </Text>
              </View>
            );
          })}
        </View>
        <View style={styles.footer}>
          <Text>Generado por OPAI · {new Date().toLocaleString("es-CL")} · Conforme Res. Exenta N°38 DT Chile</Text>
        </View>
      </Page>
    </Document>
  );
}
