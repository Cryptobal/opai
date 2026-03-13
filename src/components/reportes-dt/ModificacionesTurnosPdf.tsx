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
  badgePendiente: { fontSize: 6, color: "#92400e", backgroundColor: "#fffbeb", padding: 2, borderRadius: 2 },
  badgeOpuesta: { fontSize: 6, color: "#991b1b", backgroundColor: "#fef2f2", padding: 2, borderRadius: 2 },
  badgeConsolidada: { fontSize: 6, color: "#166534", backgroundColor: "#f0fdf4", padding: 2, borderRadius: 2 },
  footer: { marginTop: 16, fontSize: 6, color: "#94a3b8", borderTopWidth: 0.5, borderTopColor: "#e2e8f0", paddingTop: 8 },
});

const COL_WIDTHS = ["10%", "9%", "11%", "10%", "16%", "7%", "9%", "9%", "15%", "4%"];
const HEADERS = ["Fecha Mod.", "RUT", "Apellido", "Nombre", "Instalación", "Tipo", "Hora Orig.", "Hora Nueva", "Motivo", "Estado"];

function fmtHora(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" });
}

export interface ModificacionRow {
  id: string;
  tipo: string;
  timestamp: string;
  timestampOriginal: string | null;
  modifiedAt: string | null;
  modifiedBy: string | null;
  modificationReason: string | null;
  estado: "pendiente" | "opuesta" | "consolidada";
  opposedAt: string | null;
  opposedBy: string | null;
  oppositionReason: string | null;
  consolidatedAt: string | null;
  guardiaRut: string;
  guardiaLastName: string;
  guardiaFirstName: string;
  installationName: string;
}

export function ModificacionesTurnosPdf({ records, from, to }: {
  records: ModificacionRow[];
  from: string;
  to: string;
}) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Reporte de Modificaciones de Turnos</Text>
          <Text style={styles.subtitle}>Res. Exenta N°38 Art. 19 — DT Chile · Período: {from} — {to}</Text>
        </View>
        <View style={styles.table}>
          <View style={styles.thead}>
            {HEADERS.map((h, i) => (
              <Text key={h} style={[styles.theadCell, { width: COL_WIDTHS[i] }]}>{h}</Text>
            ))}
          </View>
          {records.map((r, idx) => {
            const estadoStyle =
              r.estado === "consolidada"
                ? styles.badgeConsolidada
                : r.estado === "opuesta"
                ? styles.badgeOpuesta
                : styles.badgePendiente;
            const estadoLabel =
              r.estado === "consolidada" ? "CONS." : r.estado === "opuesta" ? "OPUE." : "PEND.";
            return (
              <View key={r.id} style={[styles.row, idx % 2 === 1 ? styles.rowAlt : {}]}>
                <Text style={[styles.cell, { width: COL_WIDTHS[0] }]}>
                  {r.modifiedAt ? new Date(r.modifiedAt).toLocaleDateString("es-CL") : "—"}
                </Text>
                <Text style={[styles.cell, { width: COL_WIDTHS[1] }]}>{r.guardiaRut || "—"}</Text>
                <Text style={[styles.cell, { width: COL_WIDTHS[2] }]}>{r.guardiaLastName}</Text>
                <Text style={[styles.cell, { width: COL_WIDTHS[3] }]}>{r.guardiaFirstName}</Text>
                <Text style={[styles.cell, { width: COL_WIDTHS[4] }]}>{r.installationName}</Text>
                <Text style={[styles.cell, { width: COL_WIDTHS[5] }]}>
                  {r.tipo === "entrada" ? "Ent." : "Sal."}
                </Text>
                <Text style={[styles.cell, { width: COL_WIDTHS[6] }]}>{fmtHora(r.timestampOriginal)}</Text>
                <Text style={[styles.cell, { width: COL_WIDTHS[7] }]}>{fmtHora(r.timestamp)}</Text>
                <Text style={[styles.cell, { width: COL_WIDTHS[8] }]}>
                  {r.modificationReason ?? "—"}
                </Text>
                <Text style={[estadoStyle, { width: COL_WIDTHS[9] }]}>{estadoLabel}</Text>
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
