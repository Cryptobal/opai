/**
 * ClientReportPDF - PDF component for the client-facing security report
 * Uses @react-pdf/renderer (same pattern as PricingPDF)
 */

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

// ─── Types ────────────────────────────────────────────────

interface ReportStats {
  totalGuards: number;
  evaluatedGuards: number;
  avgCompliance: number;
  approvedGuards: number;
  lastEvaluation: string | null;
}

interface SectionCompliance {
  title: string;
  icon: string | null;
  percentage: number;
}

interface GuardPerformance {
  name: string;
  shiftLabel: string;
  latestScore: number | null;
  avgScore: number | null;
  status: "approved" | "improving" | "pending";
}

export interface ClientReportPDFProps {
  installationName: string;
  monthYear: string;
  stats: ReportStats;
  sectionCompliance: SectionCompliance[];
  guardPerformance: GuardPerformance[];
}

// ─── Colors ───────────────────────────────────────────────

const COLORS = {
  primary: "#1e293b",    // slate-800
  accent: "#3b82f6",     // blue-500
  green: "#22c55e",
  yellow: "#eab308",
  red: "#ef4444",
  gray: "#64748b",
  lightGray: "#f1f5f9",
  white: "#ffffff",
  border: "#e2e8f0",
};

// ─── Styles ───────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    padding: 0,
    backgroundColor: COLORS.white,
    fontFamily: "Helvetica",
  },
  // Header
  header: {
    backgroundColor: COLORS.primary,
    padding: 32,
    paddingBottom: 24,
  },
  headerLabel: {
    fontSize: 9,
    color: COLORS.white,
    opacity: 0.7,
    textTransform: "uppercase",
    letterSpacing: 2,
    marginBottom: 6,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: COLORS.white,
    marginBottom: 6,
  },
  headerSubtitle: {
    fontSize: 10,
    color: COLORS.white,
    opacity: 0.8,
  },
  // Body
  body: {
    padding: 32,
  },
  // Stats row
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    border: `1 solid ${COLORS.border}`,
    borderRadius: 6,
    padding: 12,
  },
  statLabel: {
    fontSize: 8,
    color: COLORS.gray,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "bold",
    color: COLORS.primary,
  },
  statUnit: {
    fontSize: 10,
    color: COLORS.gray,
  },
  statNote: {
    fontSize: 7,
    color: COLORS.gray,
    marginTop: 2,
  },
  // Section heading
  sectionTitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: COLORS.primary,
    marginBottom: 12,
  },
  // Compliance bars
  complianceContainer: {
    marginBottom: 24,
  },
  complianceRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  complianceLabel: {
    width: 160,
    fontSize: 9,
    color: COLORS.primary,
  },
  complianceBarBg: {
    flex: 1,
    height: 10,
    backgroundColor: COLORS.lightGray,
    borderRadius: 5,
    marginRight: 8,
  },
  complianceBarFill: {
    height: 10,
    borderRadius: 5,
  },
  compliancePercent: {
    width: 35,
    fontSize: 9,
    fontWeight: "bold",
    textAlign: "right",
  },
  // Table
  tableContainer: {
    marginBottom: 24,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: COLORS.lightGray,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 4,
  },
  tableHeaderCell: {
    fontSize: 8,
    fontWeight: "bold",
    color: COLORS.gray,
    textTransform: "uppercase",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottom: `1 solid ${COLORS.border}`,
  },
  tableCell: {
    fontSize: 9,
    color: COLORS.primary,
  },
  // Status badges
  badgeApproved: {
    fontSize: 8,
    color: COLORS.green,
    fontWeight: "bold",
  },
  badgeImproving: {
    fontSize: 8,
    color: COLORS.yellow,
    fontWeight: "bold",
  },
  badgePending: {
    fontSize: 8,
    color: COLORS.red,
    fontWeight: "bold",
  },
  // Footer
  footer: {
    position: "absolute",
    bottom: 24,
    left: 32,
    right: 32,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTop: `1 solid ${COLORS.border}`,
    paddingTop: 8,
  },
  footerText: {
    fontSize: 7,
    color: COLORS.gray,
  },
});

// ─── Helpers ──────────────────────────────────────────────

function getBarColor(pct: number): string {
  if (pct >= 80) return COLORS.green;
  if (pct >= 60) return COLORS.yellow;
  return COLORS.red;
}

function getTextColor(pct: number): string {
  return getBarColor(pct);
}

const STATUS_LABELS: Record<string, string> = {
  approved: "Aprobado",
  improving: "En mejora",
  pending: "Pendiente",
};

// ─── Component ────────────────────────────────────────────

export function ClientReportPDF({
  installationName,
  monthYear,
  stats,
  sectionCompliance,
  guardPerformance,
}: ClientReportPDFProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerLabel}>Reporte de Seguridad</Text>
          <Text style={styles.headerTitle}>{installationName}</Text>
          <Text style={styles.headerSubtitle}>
            Preparado por Gard Security · {monthYear}
          </Text>
        </View>

        <View style={styles.body}>
          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Guardias</Text>
              <Text style={styles.statValue}>{stats.totalGuards}</Text>
              <Text style={styles.statNote}>
                {stats.evaluatedGuards} evaluados
              </Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Cumplimiento</Text>
              <Text
                style={[
                  styles.statValue,
                  { color: getTextColor(stats.avgCompliance) },
                ]}
              >
                {stats.avgCompliance}
                <Text style={styles.statUnit}>%</Text>
              </Text>
              <Text style={styles.statNote}>Promedio protocolo</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Aprobados</Text>
              <Text style={styles.statValue}>
                {stats.approvedGuards}
                <Text style={styles.statUnit}>/{stats.totalGuards}</Text>
              </Text>
              <Text style={styles.statNote}>≥80% ultimo examen</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Ultima eval.</Text>
              <Text style={[styles.statValue, { fontSize: 12 }]}>
                {stats.lastEvaluation
                  ? new Date(stats.lastEvaluation).toLocaleDateString("es-CL", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })
                  : "—"}
              </Text>
            </View>
          </View>

          {/* Section compliance */}
          {sectionCompliance.length > 0 && (
            <View style={styles.complianceContainer}>
              <Text style={styles.sectionTitle}>
                Cumplimiento por area del protocolo
              </Text>
              {sectionCompliance.map((s) => (
                <View key={s.title} style={styles.complianceRow}>
                  <Text style={styles.complianceLabel}>
                    {s.icon ? `${s.icon} ` : ""}
                    {s.title}
                  </Text>
                  <View style={styles.complianceBarBg}>
                    <View
                      style={[
                        styles.complianceBarFill,
                        {
                          width: `${Math.min(s.percentage, 100)}%`,
                          backgroundColor: getBarColor(s.percentage),
                        },
                      ]}
                    />
                  </View>
                  <Text
                    style={[
                      styles.compliancePercent,
                      { color: getTextColor(s.percentage) },
                    ]}
                  >
                    {s.percentage}%
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Guard performance table */}
          {guardPerformance.length > 0 && (
            <View style={styles.tableContainer}>
              <Text style={styles.sectionTitle}>Rendimiento por guardia</Text>
              {/* Header */}
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderCell, { flex: 3 }]}>
                  Guardia
                </Text>
                <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Turno</Text>
                <Text
                  style={[
                    styles.tableHeaderCell,
                    { flex: 1, textAlign: "center" },
                  ]}
                >
                  Nota
                </Text>
                <Text
                  style={[
                    styles.tableHeaderCell,
                    { flex: 1.5, textAlign: "center" },
                  ]}
                >
                  Estado
                </Text>
              </View>
              {/* Rows */}
              {guardPerformance.map((g) => (
                <View key={g.name} style={styles.tableRow}>
                  <Text style={[styles.tableCell, { flex: 3 }]}>{g.name}</Text>
                  <Text style={[styles.tableCell, { flex: 1 }]}>
                    {g.shiftLabel}
                  </Text>
                  <Text
                    style={[
                      styles.tableCell,
                      {
                        flex: 1,
                        textAlign: "center",
                        fontWeight: "bold",
                        color:
                          g.latestScore != null
                            ? getTextColor(g.latestScore)
                            : COLORS.gray,
                      },
                    ]}
                  >
                    {g.latestScore != null ? `${g.latestScore}%` : "—"}
                  </Text>
                  <Text
                    style={[
                      g.status === "approved"
                        ? styles.badgeApproved
                        : g.status === "improving"
                          ? styles.badgeImproving
                          : styles.badgePending,
                      { flex: 1.5, textAlign: "center" },
                    ]}
                  >
                    {STATUS_LABELS[g.status]}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Gard Security · Documento confidencial
          </Text>
          <Text style={styles.footerText}>
            Generado el{" "}
            {new Date().toLocaleDateString("es-CL", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
