import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from "@react-pdf/renderer";
import {
  PSYCH_DIMENSION_LABELS,
  PSYCH_DIMENSIONS,
  type PsychDimension,
} from "@/lib/psych/constants";
import type { OpenAnalysisResult, PsychAlert } from "@/lib/psych/types";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica", color: "#0f172a" },
  header: { marginBottom: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  logo: { width: 40, height: 40, objectFit: "contain" },
  title: { fontSize: 16, fontWeight: "bold" },
  subtitle: { fontSize: 9, color: "#64748b" },
  section: { marginTop: 14 },
  sectionTitle: { fontSize: 12, fontWeight: "bold", marginBottom: 6 },
  scoreBox: { padding: 10, backgroundColor: "#f1f5f9", borderRadius: 6, marginVertical: 8 },
  scoreValue: { fontSize: 24, fontWeight: "bold" },
  scoreBand: { fontSize: 11, color: "#334155" },
  bar: { marginVertical: 4 },
  barLabel: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  barTrack: { height: 6, backgroundColor: "#e2e8f0", borderRadius: 3 },
  barFill: { height: 6, backgroundColor: "#0f172a", borderRadius: 3 },
  alertRow: { marginVertical: 2, padding: 4, borderLeftWidth: 2, borderLeftColor: "#f59e0b", paddingLeft: 6 },
  alertCritical: { borderLeftColor: "#dc2626" },
  openBox: { marginTop: 4, padding: 6, backgroundColor: "#f8fafc", borderRadius: 4 },
  footer: { position: "absolute", bottom: 24, left: 32, right: 32, fontSize: 7, color: "#94a3b8", borderTopWidth: 0.5, borderTopColor: "#e2e8f0", paddingTop: 6 },
});

interface Props {
  logoUrl: string | null;
  candidate: { name: string; rut: string | null };
  version: string;
  globalScore: number;
  band: string;
  dimensionScores: Record<string, { score: number; itemCount: number }>;
  alerts: PsychAlert[];
  openAnalysis: OpenAnalysisResult[];
  reviewer: { name: string; date: Date } | null;
  generatedAt: Date;
}

const BAND_LABEL: Record<string, string> = {
  FIT: "Apto",
  FIT_CAUTION: "Apto con observación",
  NOT_RECOMMENDED: "No recomendado",
};

export function PsychReportPdf(props: Props) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {props.logoUrl ? <Image src={props.logoUrl} style={styles.logo} /> : null}
          <View>
            <Text style={styles.title}>Informe psicolaboral</Text>
            <Text style={styles.subtitle}>Generado el {props.generatedAt.toLocaleDateString("es-CL")}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Datos del evaluado</Text>
          <Text>Nombre: {props.candidate.name}</Text>
          {props.candidate.rut ? <Text>RUT: {props.candidate.rut}</Text> : null}
          <Text style={styles.subtitle}>Versión del test: {props.version}</Text>
        </View>

        <View style={styles.scoreBox}>
          <Text style={styles.subtitle}>Puntaje global</Text>
          <Text style={styles.scoreValue}>{props.globalScore.toFixed(1)} / 100</Text>
          <Text style={styles.scoreBand}>{BAND_LABEL[props.band] ?? props.band}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Perfil por dimensión</Text>
          {PSYCH_DIMENSIONS.filter(
            (dim) =>
              dim !== "VOCATIONAL_FIT" &&
              (props.dimensionScores[dim]?.itemCount ?? 0) > 0,
          ).map((dim) => {
            const s = props.dimensionScores[dim]?.score ?? 0;
            const pct = Math.round(s * 100);
            return (
              <View key={dim} style={styles.bar}>
                <View style={styles.barLabel}>
                  <Text>{PSYCH_DIMENSION_LABELS[dim as PsychDimension]}</Text>
                  <Text>{pct}</Text>
                </View>
                <View style={styles.barTrack}>
                  <View style={{ ...styles.barFill, width: `${pct}%` }} />
                </View>
              </View>
            );
          })}
        </View>

        {(props.dimensionScores.VOCATIONAL_FIT?.itemCount ?? 0) > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ajuste vocacional (informativo)</Text>
            <View style={styles.bar}>
              <View style={styles.barLabel}>
                <Text>Pasión por la seguridad</Text>
                <Text>{Math.round((props.dimensionScores.VOCATIONAL_FIT.score ?? 0) * 100)}</Text>
              </View>
              <View style={styles.barTrack}>
                <View style={{ ...styles.barFill, width: `${Math.round((props.dimensionScores.VOCATIONAL_FIT.score ?? 0) * 100)}%`, backgroundColor: "#16a34a" }} />
              </View>
            </View>
          </View>
        ) : null}

        {props.openAnalysis.length > 0 ? (
          <View style={styles.section} wrap>
            <Text style={styles.sectionTitle}>Análisis cualitativo</Text>
            {props.openAnalysis.map((o) => (
              <View key={o.itemId} style={styles.openBox}>
                <Text>{o.summary || "Sin análisis disponible."}</Text>
                {o.markers.length > 0 ? (
                  <Text style={styles.subtitle}>Marcadores: {o.markers.join(", ")}</Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {props.alerts.length > 0 ? (
          <View style={styles.section} wrap>
            <Text style={styles.sectionTitle}>Alertas</Text>
            {props.alerts.map((a, i) => (
              <View
                key={`${a.code}-${i}`}
                style={a.severity === "critical" ? { ...styles.alertRow, ...styles.alertCritical } : styles.alertRow}
              >
                <Text>{a.message}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {props.reviewer ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Revisión</Text>
            <Text>Revisado por: {props.reviewer.name}</Text>
            <Text style={styles.subtitle}>Fecha: {props.reviewer.date.toLocaleDateString("es-CL")}</Text>
          </View>
        ) : null}

        <Text style={styles.footer} fixed>
          Este informe es una herramienta de screening interno. No sustituye el Informe de
          Control de Impulsos OS-10 exigido por Carabineros de Chile, que debe ser
          emitido por un psicólogo acreditado.
        </Text>
      </Page>
    </Document>
  );
}
