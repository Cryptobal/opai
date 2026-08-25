/**
 * Render del informe operativo / visitas a Buffer.
 *
 * IMPORTANT: este archivo DEBE quedarse como .ts plano (sin JSX).
 * Usa eval('require') + React.createElement para evitar dos fallos:
 * 1. Next.js SWC compila JSX con su React, incompatible con el
 *    react-reconciler de @react-pdf/renderer (500 en Vercel).
 * 2. eval('require') carga React desde el mismo node_modules.
 *
 * @react-pdf/renderer es ESM-only: require() falla en prod → import().
 * No importar pdf.tsx ni ningún .tsx del árbol PDF.
 * No usar fontStyle:"italic" sobre Helvetica (Helvetica-Oblique no está
 * registrado y mata TODO el PDF).
 *
 * Mismo patrón que quotation/render-quotation.ts y
 * protocols/client-report-pdf.ts.
 */

import { formatDateTimeCl } from "./period";
import type {
  DigestIncidente,
  DigestReportData,
  VisitReportData,
  VisitRow,
} from "./types";

type PdfModule = typeof import("@react-pdf/renderer");

type PdfRuntime = {
  e: (...args: unknown[]) => unknown;
  pdf: PdfModule;
};

async function loadPdfRuntime(): Promise<PdfRuntime> {
  // eslint-disable-next-line no-eval
  const nodeRequire = eval("require") as NodeRequire;
  const React = nodeRequire("react") as {
    createElement: (...args: unknown[]) => unknown;
  };
  const pdf = await import("@react-pdf/renderer");
  return { e: React.createElement, pdf };
}

async function renderWithRuntime(
  build: (rt: PdfRuntime) => unknown
): Promise<Buffer> {
  try {
    const rt = await loadPdfRuntime();
    const buf = await rt.pdf.renderToBuffer(build(rt) as never);
    return Buffer.from(buf);
  } catch (error) {
    console.error("[OPS][CLIENT-REPORT]", error);
    throw error;
  }
}

const navy = "#0f172a";
const teal = "#0f766e";
const slate = "#475569";
const line = "#e2e8f0";
const muted = "#64748b";
const GARD_BLUE = "#0059A3";

function createStyles(StyleSheet: PdfModule["StyleSheet"]) {
  return StyleSheet.create({
    page: {
      paddingTop: 36,
      paddingBottom: 48,
      paddingHorizontal: 40,
      fontFamily: "Helvetica",
      fontSize: 10,
      color: navy,
      backgroundColor: "#ffffff",
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      borderBottomWidth: 1.5,
      borderBottomColor: navy,
      paddingBottom: 10,
      marginBottom: 16,
    },
    brandCol: {
      flexDirection: "row",
      alignItems: "center",
    },
    gardMark: { marginRight: 10 },
    brandName: {
      fontFamily: "Helvetica-Bold",
      fontSize: 14,
      letterSpacing: 3,
      color: navy,
    },
    brandSub: {
      fontSize: 8,
      letterSpacing: 2.4,
      color: teal,
      marginTop: 2,
    },
    docTitle: {
      fontFamily: "Helvetica-Bold",
      fontSize: 11,
      textAlign: "right",
      color: navy,
    },
    docMeta: { fontSize: 8, color: muted, textAlign: "right", marginTop: 3 },
    h1: { fontFamily: "Helvetica-Bold", fontSize: 13, marginBottom: 4 },
    h2: {
      fontFamily: "Helvetica-Bold",
      fontSize: 10,
      color: navy,
      marginTop: 14,
      marginBottom: 6,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      borderBottomWidth: 0.6,
      borderBottomColor: line,
      paddingBottom: 3,
    },
    p: { fontSize: 9, color: slate, lineHeight: 1.4, marginBottom: 3 },
    row: { flexDirection: "row", marginBottom: 8 },
    kpi: {
      flex: 1,
      borderWidth: 0.8,
      borderColor: line,
      padding: 8,
      marginRight: 8,
    },
    kpiLast: {
      flex: 1,
      borderWidth: 0.8,
      borderColor: line,
      padding: 8,
    },
    kpiLabel: {
      fontSize: 7,
      color: muted,
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    kpiValue: {
      fontFamily: "Helvetica-Bold",
      fontSize: 16,
      marginTop: 3,
      color: navy,
    },
    kpiHint: { fontSize: 7, color: muted, marginTop: 2 },
    tableHeader: {
      flexDirection: "row",
      backgroundColor: "#f8fafc",
      borderTopWidth: 0.6,
      borderBottomWidth: 0.6,
      borderColor: line,
      paddingVertical: 4,
      paddingHorizontal: 4,
    },
    tableRow: {
      flexDirection: "row",
      borderBottomWidth: 0.4,
      borderBottomColor: line,
      paddingVertical: 5,
      paddingHorizontal: 4,
    },
    th: {
      fontFamily: "Helvetica-Bold",
      fontSize: 7,
      color: muted,
      textTransform: "uppercase",
    },
    td: { fontSize: 8, color: navy },
    visitBlock: {
      marginBottom: 10,
      paddingBottom: 8,
      borderBottomWidth: 0.4,
      borderBottomColor: line,
    },
    footer: {
      position: "absolute",
      bottom: 22,
      left: 40,
      right: 40,
      fontSize: 7,
      color: muted,
      flexDirection: "row",
      justifyContent: "space-between",
      borderTopWidth: 0.6,
      borderTopColor: line,
      paddingTop: 6,
    },
    // Sin fontStyle italic: Helvetica-Oblique no está registrado.
    empty: { fontSize: 9, color: muted, marginTop: 4 },
  });
}

type Styles = ReturnType<typeof createStyles>;

function gardMark(
  e: PdfRuntime["e"],
  Svg: PdfModule["Svg"],
  Path: PdfModule["Path"],
  markStyle: unknown
) {
  return e(
    Svg,
    { width: 32, height: 32, viewBox: "0 0 100 100", style: markStyle },
    e(Path, {
      d: "M50 5L15 20V50C15 70 30 85 50 95C70 85 85 70 85 50V20L50 5ZM50 10L80 23V50C80 67.5 67.5 80 50 90C32.5 80 20 67.5 20 50V23L50 10Z",
      fill: GARD_BLUE,
    }),
    e(Path, {
      d: "M50 15L25 25V50C25 65 35 75 50 82.5C65 75 75 65 75 50V25L50 15ZM50 85C30 77.5 20 65 20 50V22.5L50 7.5L80 22.5V50C80 65 70 77.5 50 85Z",
      fill: GARD_BLUE,
    }),
    e(Path, {
      d: "M42.5 62.5L30 50L35 45L42.5 52.5L65 30L70 35L42.5 62.5Z",
      fill: GARD_BLUE,
    })
  );
}

function header(
  rt: PdfRuntime,
  s: Styles,
  props: { docTitle: string; periodLabel: string; generatedAtLabel: string }
) {
  const { e, pdf } = rt;
  const { View, Text, Svg, Path } = pdf;
  return e(
    View,
    { style: s.header },
    e(
      View,
      { style: s.brandCol },
      gardMark(e, Svg, Path, s.gardMark),
      e(
        View,
        null,
        e(Text, { style: s.brandName }, "GARD"),
        e(Text, { style: s.brandSub }, "SECURITY")
      )
    ),
    e(
      View,
      null,
      e(Text, { style: s.docTitle }, props.docTitle),
      e(Text, { style: s.docMeta }, props.periodLabel),
      e(Text, { style: s.docMeta }, `Emitido ${props.generatedAtLabel}`)
    )
  );
}

function footer(rt: PdfRuntime, s: Styles, companyName: string) {
  const { e, pdf } = rt;
  const { View, Text } = pdf;
  return e(
    View,
    { style: s.footer, fixed: true },
    e(
      Text,
      null,
      `${companyName} · Documento confidencial — uso exclusivo del cliente`
    ),
    e(Text, {
      render: ({
        pageNumber,
        totalPages,
      }: {
        pageNumber: number;
        totalPages: number;
      }) => `Pág. ${pageNumber} / ${totalPages}`,
    })
  );
}

function kpiCard(
  rt: PdfRuntime,
  s: Styles,
  opts: { label: string; value: string; hint?: string; last: boolean }
) {
  const { e, pdf } = rt;
  const { View, Text } = pdf;
  return e(
    View,
    { style: opts.last ? s.kpiLast : s.kpi },
    e(Text, { style: s.kpiLabel }, opts.label),
    e(Text, { style: s.kpiValue }, opts.value),
    opts.hint ? e(Text, { style: s.kpiHint }, opts.hint) : null
  );
}

function fmtPct(n: number | null): string {
  return n == null ? "—" : `${n}%`;
}

function visitBlocks(rt: PdfRuntime, s: Styles, visits: VisitRow[]) {
  const { e, pdf } = rt;
  const { View, Text } = pdf;
  if (visits.length === 0) {
    return e(
      Text,
      { style: s.empty },
      "No hay visitas de supervisión en este período."
    );
  }
  return e(
    View,
    null,
    ...visits.map((v) =>
      e(
        View,
        { key: v.id, style: s.visitBlock, wrap: false },
        e(
          Text,
          { style: { fontFamily: "Helvetica-Bold", fontSize: 9 } },
          `${formatDateTimeCl(v.checkInAt)}${
            v.durationMinutes != null ? `  ·  ${v.durationMinutes} min` : ""
          }`
        ),
        e(Text, { style: s.p }, `Supervisor: ${v.supervisorName}`),
        v.installationState
          ? e(
              Text,
              { style: s.p },
              `Estado de la instalación: ${v.installationState}`
            )
          : null,
        v.generalComments ? e(Text, { style: s.p }, v.generalComments) : null,
        v.findings.length > 0
          ? e(
              View,
              { style: { marginTop: 4 } },
              e(Text, { style: s.th }, "Hallazgos"),
              ...v.findings.map((f, i) =>
                e(
                  Text,
                  { key: `${v.id}-f-${i}`, style: s.p },
                  `· ${f.description}  (${f.status})`
                )
              )
            )
          : null
      )
    )
  );
}

function buildVisitDocument(rt: PdfRuntime, data: VisitReportData) {
  const { e, pdf } = rt;
  const s = createStyles(pdf.StyleSheet);
  const { Document, Page, View, Text } = pdf;
  return e(
    Document,
    { title: `Informe de visitas — ${data.accountName}`, author: "GARD Security" },
    e(
      Page,
      { size: "A4", style: s.page },
      header(rt, s, {
        docTitle: "Informe de visitas de supervisión",
        periodLabel: data.periodLabel,
        generatedAtLabel: data.generatedAtLabel,
      }),
      e(Text, { style: s.h1 }, data.accountName),
      e(
        Text,
        { style: s.p },
        "Resumen de las visitas de supervisión realizadas en el período indicado."
      ),
      ...data.installations.map((inst) =>
        e(
          View,
          { key: inst.id },
          e(Text, { style: s.h2 }, inst.name),
          inst.address ? e(Text, { style: s.p }, inst.address) : null,
          visitBlocks(rt, s, inst.visits)
        )
      ),
      footer(rt, s, data.companyName)
    )
  );
}

function incidentesTable(
  rt: PdfRuntime,
  s: Styles,
  incidentes: DigestIncidente[]
) {
  const { e, pdf } = rt;
  const { View, Text } = pdf;
  if (incidentes.length === 0) {
    return e(Text, { style: s.empty }, "Sin incidentes QR en el período.");
  }
  return e(
    View,
    null,
    e(
      View,
      { style: s.tableHeader },
      e(Text, { style: [s.th, { width: "18%" }] }, "Código"),
      e(Text, { style: [s.th, { width: "44%" }] }, "Descripción"),
      e(Text, { style: [s.th, { width: "22%" }] }, "Fecha"),
      e(Text, { style: [s.th, { width: "16%" }] }, "Estado")
    ),
    ...incidentes.map((inc) =>
      e(
        View,
        { key: inc.code, style: s.tableRow, wrap: false },
        e(Text, { style: [s.td, { width: "18%" }] }, inc.code),
        e(Text, { style: [s.td, { width: "44%" }] }, inc.title),
        e(Text, { style: [s.td, { width: "22%" }] }, formatDateTimeCl(inc.createdAt)),
        e(Text, { style: [s.td, { width: "16%" }] }, inc.statusLabel)
      )
    )
  );
}

function buildDigestDocument(rt: PdfRuntime, data: DigestReportData) {
  const { e, pdf } = rt;
  const s = createStyles(pdf.StyleSheet);
  const { Document, Page, View, Text } = pdf;
  const { kpis, sections } = data;

  type KpiSpec = { label: string; value: string; hint: string };
  const kpiSpecs: KpiSpec[] = [];
  if (sections.includeAsistencia) {
    kpiSpecs.push({
      label: "Asistencia",
      value: fmtPct(kpis.asistenciaPct),
      hint: `${kpis.slotsCovered} turnos con personal presente`,
    });
  }
  if (sections.includeCobertura) {
    kpiSpecs.push({
      label: "Cobertura",
      value: fmtPct(kpis.coberturaPct),
      hint: `${kpis.slotsCovered} de ${kpis.slotsTotal} turnos pautados`,
    });
  }
  if (sections.includeRondas) {
    kpiSpecs.push({
      label: "Rondas",
      value: fmtPct(kpis.rondasPct),
      hint: `${kpis.rondasCompleted} de ${kpis.rondasTotal} programadas`,
    });
  }
  if (sections.includeIncidentes) {
    kpiSpecs.push({
      label: "Incidentes QR",
      value: String(kpis.incidentesTotal),
      hint: `${kpis.incidentesResueltos} resueltos · ${kpis.incidentesAbiertos} abiertos`,
    });
  }
  if (sections.includeVisitas) {
    kpiSpecs.push({
      label: "Visitas",
      value: String(kpis.visitasCount),
      hint: "Supervisión en el período",
    });
  }

  const kpiRow = (items: KpiSpec[]) =>
    e(
      View,
      { style: s.row },
      ...items.map((item, i) =>
        kpiCard(rt, s, { ...item, last: i === items.length - 1 })
      )
    );

  return e(
    Document,
    {
      title: `Informe operativo — ${data.installationName}`,
      author: "GARD Security",
    },
    e(
      Page,
      { size: "A4", style: s.page },
      header(rt, s, {
        docTitle: "Informe operativo",
        periodLabel: data.periodLabel,
        generatedAtLabel: data.generatedAtLabel,
      }),
      e(Text, { style: s.h1 }, data.installationName),
      e(Text, { style: s.p }, data.accountName),
      data.installationAddress
        ? e(Text, { style: s.p }, data.installationAddress)
        : null,
      kpiSpecs.length > 0 ? kpiRow(kpiSpecs.slice(0, 3)) : null,
      kpiSpecs.length > 3 ? kpiRow(kpiSpecs.slice(3)) : null,
      sections.includeIncidentes
        ? e(
            View,
            null,
            e(Text, { style: s.h2 }, "Incidentes reportados en instalación"),
            incidentesTable(rt, s, data.incidentes)
          )
        : null,
      sections.includeVisitas
        ? e(
            View,
            null,
            e(Text, { style: s.h2 }, "Visitas de supervisión"),
            visitBlocks(rt, s, data.visits)
          )
        : null,
      footer(rt, s, data.companyName)
    )
  );
}

export async function renderVisitReportPdf(
  data: VisitReportData
): Promise<Buffer> {
  return renderWithRuntime((rt) => buildVisitDocument(rt, data));
}

export async function renderDigestPdf(data: DigestReportData): Promise<Buffer> {
  return renderWithRuntime((rt) => buildDigestDocument(rt, data));
}
