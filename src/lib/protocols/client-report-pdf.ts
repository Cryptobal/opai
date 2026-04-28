/**
 * Renders the "Reporte cliente" PDF using @react-pdf/renderer.
 *
 * Style: white/print-friendly (deliberately departs from the dark UI of
 * the operator/portal — this PDF is meant to be shared with the client).
 * Layout follows the spirit of the in-app preview at
 * `src/components/crm/protocol/ClientViewSubTab.tsx`.
 *
 * IMPORTANT: this file is plain .ts (no JSX) and uses
 * `React.createElement` so it works even when bundled by Next.js'
 * SWC pipeline alongside @react-pdf's own React reconciler. Pattern
 * copied from `src/lib/pdf/templates/quotation/render-quotation.ts`.
 */

import type { ClientReportData } from "@/lib/protocols/client-report";

const COLOR = {
  ink: "#0F172A",
  muted: "#475569",
  soft: "#94A3B8",
  border: "#E2E8F0",
  bg: "#F8FAFC",
  ok: "#059669",
  warn: "#D97706",
  danger: "#DC2626",
  brand: "#0066FF",
  white: "#FFFFFF",
};

function thresholdColor(pct: number | null): string {
  if (pct == null) return COLOR.soft;
  if (pct >= 80) return COLOR.ok;
  if (pct >= 60) return COLOR.warn;
  return COLOR.danger;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("es-CL", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

function fmtShortDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("es-CL", {
      year: "2-digit",
      month: "short",
      day: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

const STATUS_LABEL: Record<string, string> = {
  approved: "Aprobado",
  borderline: "Cumple mínimo",
  failed: "Bajo mínimo",
  pending: "Pendiente",
  unevaluated: "Sin evaluar",
};

export async function renderClientReportPdf(
  data: ClientReportData,
): Promise<Buffer> {
  // eslint-disable-next-line no-eval
  const nodeRequire = eval("require") as NodeRequire;
  const React = nodeRequire("react");
  const pdf = await import("@react-pdf/renderer");
  const { renderToBuffer, Document, Page, View, Text, StyleSheet } = pdf;
  const e = React.createElement;

  const s = StyleSheet.create({
    page: {
      fontFamily: "Helvetica",
      fontSize: 10,
      color: COLOR.ink,
      backgroundColor: COLOR.white,
      padding: 36,
    },
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      borderBottom: `1pt solid ${COLOR.border}`,
      paddingBottom: 14,
      marginBottom: 18,
    },
    title: {
      fontSize: 18,
      fontWeight: 700,
      color: COLOR.ink,
      marginBottom: 2,
    },
    subTitle: {
      fontSize: 10,
      color: COLOR.muted,
    },
    eyebrow: {
      fontSize: 8,
      letterSpacing: 1.5,
      textTransform: "uppercase",
      color: COLOR.brand,
      marginBottom: 4,
      fontWeight: 700,
    },
    issueDate: {
      fontSize: 9,
      color: COLOR.soft,
      textAlign: "right",
    },
    kpiRow: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 22,
    },
    kpiCard: {
      flex: 1,
      borderRadius: 6,
      backgroundColor: COLOR.bg,
      padding: 12,
    },
    kpiLabel: {
      fontSize: 8,
      color: COLOR.soft,
      letterSpacing: 1,
      textTransform: "uppercase",
      marginBottom: 4,
    },
    kpiValue: {
      fontSize: 18,
      fontWeight: 700,
      color: COLOR.ink,
    },
    sectionTitle: {
      fontSize: 12,
      fontWeight: 700,
      marginBottom: 10,
      marginTop: 4,
      color: COLOR.ink,
    },
    sectionRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 6,
      borderBottom: `0.5pt solid ${COLOR.border}`,
    },
    sectionLabel: {
      flex: 1,
      fontSize: 10,
      color: COLOR.ink,
    },
    barTrack: {
      width: 140,
      height: 6,
      backgroundColor: COLOR.border,
      borderRadius: 3,
      marginRight: 10,
      overflow: "hidden",
    },
    barFill: { height: 6, borderRadius: 3 },
    pct: { width: 38, textAlign: "right", fontSize: 10, fontWeight: 700 },
    table: {
      borderTop: `0.5pt solid ${COLOR.border}`,
      borderLeft: `0.5pt solid ${COLOR.border}`,
      borderRight: `0.5pt solid ${COLOR.border}`,
      borderRadius: 4,
      marginTop: 6,
    },
    th: {
      flexDirection: "row",
      backgroundColor: COLOR.bg,
      borderBottom: `0.5pt solid ${COLOR.border}`,
      paddingVertical: 6,
      paddingHorizontal: 8,
    },
    td: {
      flexDirection: "row",
      borderBottom: `0.5pt solid ${COLOR.border}`,
      paddingVertical: 6,
      paddingHorizontal: 8,
    },
    thText: {
      fontSize: 8,
      letterSpacing: 1,
      textTransform: "uppercase",
      color: COLOR.muted,
      fontWeight: 700,
    },
    cellName: { flex: 3, fontSize: 10, color: COLOR.ink },
    cellShift: { flex: 2, fontSize: 9, color: COLOR.muted },
    cellExam: { flex: 2, fontSize: 9, color: COLOR.muted },
    cellScore: { flex: 1, fontSize: 10, fontWeight: 700, textAlign: "right" },
    cellStatus: { flex: 2, fontSize: 9, textAlign: "right" },
    footer: {
      position: "absolute",
      bottom: 24,
      left: 36,
      right: 36,
      borderTop: `0.5pt solid ${COLOR.border}`,
      paddingTop: 8,
      flexDirection: "row",
      justifyContent: "space-between",
    },
    footerText: { fontSize: 8, color: COLOR.soft },
  });

  function header() {
    return e(
      View,
      { style: s.headerRow },
      e(
        View,
        { style: { flexDirection: "column" } },
        e(Text, { style: s.eyebrow }, "Reporte de Seguridad"),
        e(Text, { style: s.title }, data.installation.name),
        e(
          Text,
          { style: s.subTitle },
          [data.installation.accountName, data.installation.commune]
            .filter(Boolean)
            .join(" · ") || "—",
        ),
      ),
      e(
        View,
        { style: { flexDirection: "column", alignItems: "flex-end" } },
        data.tenant.companyName
          ? e(Text, { style: { fontSize: 10, fontWeight: 700, color: COLOR.ink } }, data.tenant.companyName)
          : null,
        e(Text, { style: s.issueDate }, `Emitido el ${fmtDate(data.generatedAt)}`),
      ),
    );
  }

  function kpis() {
    const cards: Array<{ label: string; value: string; color?: string }> = [
      {
        label: "Guardias activos",
        value: String(data.kpis.activeGuards),
      },
      {
        label: "Cumplimiento",
        value:
          data.kpis.avgCompliance !== null
            ? `${Math.round(data.kpis.avgCompliance)}%`
            : "—",
        color: thresholdColor(data.kpis.avgCompliance),
      },
      {
        label: "Aprobados (≥80%)",
        value: String(data.kpis.approvedCount),
        color: COLOR.ok,
      },
      {
        label: "Última evaluación",
        value: fmtShortDate(data.kpis.lastExamAt),
      },
    ];
    return e(
      View,
      { style: s.kpiRow },
      ...cards.map((c, i) =>
        e(
          View,
          { key: i, style: s.kpiCard },
          e(Text, { style: s.kpiLabel }, c.label),
          e(
            Text,
            { style: [s.kpiValue, c.color ? { color: c.color } : null] },
            c.value,
          ),
        ),
      ),
    );
  }

  function sectionCompliance() {
    if (!data.sectionCompliance.length) return null;
    return e(
      View,
      { style: { marginBottom: 22 } },
      e(Text, { style: s.sectionTitle }, "Cumplimiento por sección"),
      ...data.sectionCompliance.map((sc, i) => {
        const pct = sc.percent ?? 0;
        const color = thresholdColor(sc.percent);
        return e(
          View,
          { key: i, style: s.sectionRow },
          e(Text, { style: s.sectionLabel }, `${sc.icon}  ${sc.title}`),
          e(
            View,
            { style: s.barTrack },
            e(View, {
              style: [
                s.barFill,
                {
                  width: `${pct}%`,
                  backgroundColor: color,
                },
              ],
            }),
          ),
          e(
            Text,
            { style: [s.pct, { color }] },
            sc.percent !== null ? `${sc.percent}%` : "—",
          ),
        );
      }),
    );
  }

  function guardsTable() {
    if (!data.guards.length) return null;
    return e(
      View,
      { style: { marginBottom: 14 } },
      e(Text, { style: s.sectionTitle }, "Desempeño por guardia"),
      e(
        View,
        { style: s.table },
        e(
          View,
          { style: s.th },
          e(Text, { style: [s.cellName, s.thText] }, "Guardia"),
          e(Text, { style: [s.cellShift, s.thText] }, "Turno"),
          e(Text, { style: [s.cellExam, s.thText] }, "Último examen"),
          e(Text, { style: [s.cellScore, s.thText] }, "Nota"),
          e(Text, { style: [s.cellStatus, s.thText] }, "Estado"),
        ),
        ...data.guards.map((g, i) => {
          const color = thresholdColor(g.avgScore);
          return e(
            View,
            { key: i, style: s.td },
            e(Text, { style: s.cellName }, g.name),
            e(Text, { style: s.cellShift }, g.shift ?? "—"),
            e(Text, { style: s.cellExam }, fmtShortDate(g.lastExamAt)),
            e(
              Text,
              {
                style: [
                  s.cellScore,
                  { color: g.avgScore !== null ? color : COLOR.soft },
                ],
              },
              g.avgScore !== null ? `${Math.round(g.avgScore)}%` : "—",
            ),
            e(
              Text,
              {
                style: [
                  s.cellStatus,
                  {
                    color:
                      g.status === "approved"
                        ? COLOR.ok
                        : g.status === "failed"
                          ? COLOR.danger
                          : g.status === "borderline" || g.status === "pending"
                            ? COLOR.warn
                            : COLOR.soft,
                  },
                ],
              },
              STATUS_LABEL[g.status] ?? "—",
            ),
          );
        }),
      ),
    );
  }

  function footer() {
    return e(
      View,
      { style: s.footer, fixed: true },
      e(Text, { style: s.footerText }, `Generado por OPAI · ${fmtDate(data.generatedAt)}`),
      e(Text, { style: s.footerText }, "Documento confidencial"),
    );
  }

  const doc = e(
    Document,
    null,
    e(
      Page,
      { size: "A4", style: s.page },
      header(),
      kpis(),
      sectionCompliance(),
      guardsTable(),
      footer(),
    ),
  );

  const buffer = await renderToBuffer(doc);
  return Buffer.from(buffer);
}
