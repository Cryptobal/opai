import { Document, Page, Text, View, StyleSheet, Svg, Path } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { formatDateTimeCl } from "./period";
import type { DigestReportData, VisitReportData, VisitRow } from "./types";

const navy = "#0f172a";
const teal = "#0f766e";
const slate = "#475569";
const line = "#e2e8f0";
const muted = "#64748b";

const s = StyleSheet.create({
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
  brandCol: { flexDirection: "row", alignItems: "center", gap: 10 },
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
  row: { flexDirection: "row", gap: 8, marginBottom: 8 },
  kpi: {
    flex: 1,
    borderWidth: 0.8,
    borderColor: line,
    padding: 8,
  },
  kpiLabel: { fontSize: 7, color: muted, textTransform: "uppercase", letterSpacing: 0.6 },
  kpiValue: { fontFamily: "Helvetica-Bold", fontSize: 16, marginTop: 3, color: navy },
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
  th: { fontFamily: "Helvetica-Bold", fontSize: 7, color: muted, textTransform: "uppercase" },
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
  empty: { fontSize: 9, color: muted, fontStyle: "italic", marginTop: 4 },
});

/** Escudo oficial GARD (`public/logos/logo-escudo-azul.svg`). */
const GARD_BLUE = "#0059A3";

function GardMark() {
  return (
    <Svg width={32} height={32} viewBox="0 0 100 100">
      <Path
        d="M50 5L15 20V50C15 70 30 85 50 95C70 85 85 70 85 50V20L50 5ZM50 10L80 23V50C80 67.5 67.5 80 50 90C32.5 80 20 67.5 20 50V23L50 10Z"
        fill={GARD_BLUE}
      />
      <Path
        d="M50 15L25 25V50C25 65 35 75 50 82.5C65 75 75 65 75 50V25L50 15ZM50 85C30 77.5 20 65 20 50V22.5L50 7.5L80 22.5V50C80 65 70 77.5 50 85Z"
        fill={GARD_BLUE}
      />
      <Path
        d="M42.5 62.5L30 50L35 45L42.5 52.5L65 30L70 35L42.5 62.5Z"
        fill={GARD_BLUE}
      />
    </Svg>
  );
}

function Header(props: {
  docTitle: string;
  periodLabel: string;
  generatedAtLabel: string;
}) {
  return (
    <View style={s.header}>
      <View style={s.brandCol}>
        <GardMark />
        <View>
          <Text style={s.brandName}>GARD</Text>
          <Text style={s.brandSub}>SECURITY</Text>
        </View>
      </View>
      <View>
        <Text style={s.docTitle}>{props.docTitle}</Text>
        <Text style={s.docMeta}>{props.periodLabel}</Text>
        <Text style={s.docMeta}>Emitido {props.generatedAtLabel}</Text>
      </View>
    </View>
  );
}

function Footer({ companyName }: { companyName: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>{companyName} · Documento confidencial — uso exclusivo del cliente</Text>
      <Text render={({ pageNumber, totalPages }) => `Pág. ${pageNumber} / ${totalPages}`} />
    </View>
  );
}

function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <View style={s.kpi}>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={s.kpiValue}>{value}</Text>
      {hint ? <Text style={s.kpiHint}>{hint}</Text> : null}
    </View>
  );
}

function fmtPct(n: number | null): string {
  return n == null ? "—" : `${n}%`;
}

function VisitBlocks({ visits }: { visits: VisitRow[] }) {
  if (visits.length === 0) {
    return <Text style={s.empty}>No hay visitas de supervisión en este período.</Text>;
  }
  return (
    <>
      {visits.map((v) => (
        <View key={v.id} style={s.visitBlock} wrap={false}>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 9 }}>
            {formatDateTimeCl(v.checkInAt)}
            {v.durationMinutes != null ? `  ·  ${v.durationMinutes} min` : ""}
          </Text>
          <Text style={s.p}>Supervisor: {v.supervisorName}</Text>
          {v.installationState ? (
            <Text style={s.p}>Estado de la instalación: {v.installationState}</Text>
          ) : null}
          {v.generalComments ? <Text style={s.p}>{v.generalComments}</Text> : null}
          {v.findings.length > 0 ? (
            <View style={{ marginTop: 4 }}>
              <Text style={s.th}>Hallazgos</Text>
              {v.findings.map((f, i) => (
                <Text key={`${v.id}-f-${i}`} style={s.p}>
                  · {f.description}  ({f.status})
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ))}
    </>
  );
}

export function VisitReportPdf({ data }: { data: VisitReportData }) {
  return (
    <Document
      title={`Informe de visitas — ${data.accountName}`}
      author="GARD Security"
    >
      <Page size="A4" style={s.page}>
        <Header
          docTitle="Informe de visitas de supervisión"
          periodLabel={data.periodLabel}
          generatedAtLabel={data.generatedAtLabel}
        />
        <Text style={s.h1}>{data.accountName}</Text>
        <Text style={s.p}>
          Resumen de las visitas de supervisión realizadas en el período indicado.
        </Text>
        {data.installations.map((inst) => (
          <View key={inst.id}>
            <Text style={s.h2}>{inst.name}</Text>
            {inst.address ? <Text style={s.p}>{inst.address}</Text> : null}
            <VisitBlocks visits={inst.visits} />
          </View>
        ))}
        <Footer companyName={data.companyName} />
      </Page>
    </Document>
  );
}

export function OpsDigestPdf({ data }: { data: DigestReportData }) {
  const { kpis, sections } = data;
  const kpisShown: ReactNode[] = [];
  if (sections.includeAsistencia) {
    kpisShown.push(
      <Kpi
        key="as"
        label="Asistencia"
        value={fmtPct(kpis.asistenciaPct)}
        hint={`${kpis.slotsCovered} turnos con personal presente`}
      />
    );
  }
  if (sections.includeCobertura) {
    kpisShown.push(
      <Kpi
        key="co"
        label="Cobertura"
        value={fmtPct(kpis.coberturaPct)}
        hint={`${kpis.slotsCovered} de ${kpis.slotsTotal} turnos pautados`}
      />
    );
  }
  if (sections.includeRondas) {
    kpisShown.push(
      <Kpi
        key="ro"
        label="Rondas"
        value={fmtPct(kpis.rondasPct)}
        hint={`${kpis.rondasCompleted} de ${kpis.rondasTotal} programadas`}
      />
    );
  }
  if (sections.includeIncidentes) {
    kpisShown.push(
      <Kpi
        key="in"
        label="Incidentes QR"
        value={String(kpis.incidentesTotal)}
        hint={`${kpis.incidentesResueltos} resueltos · ${kpis.incidentesAbiertos} abiertos`}
      />
    );
  }
  if (sections.includeVisitas) {
    kpisShown.push(
      <Kpi
        key="vi"
        label="Visitas"
        value={String(kpis.visitasCount)}
        hint="Supervisión en el período"
      />
    );
  }

  return (
    <Document
      title={`Informe operativo — ${data.installationName}`}
      author="GARD Security"
    >
      <Page size="A4" style={s.page}>
        <Header
          docTitle="Informe operativo"
          periodLabel={data.periodLabel}
          generatedAtLabel={data.generatedAtLabel}
        />
        <Text style={s.h1}>{data.installationName}</Text>
        <Text style={s.p}>{data.accountName}</Text>
        {data.installationAddress ? (
          <Text style={s.p}>{data.installationAddress}</Text>
        ) : null}

        {kpisShown.length > 0 ? (
          <View style={s.row}>{kpisShown.slice(0, 3)}</View>
        ) : null}
        {kpisShown.length > 3 ? (
          <View style={s.row}>{kpisShown.slice(3)}</View>
        ) : null}

        {sections.includeIncidentes ? (
          <View>
            <Text style={s.h2}>Incidentes reportados en instalación</Text>
            {data.incidentes.length === 0 ? (
              <Text style={s.empty}>Sin incidentes QR en el período.</Text>
            ) : (
              <>
                <View style={s.tableHeader}>
                  <Text style={[s.th, { width: "18%" }]}>Código</Text>
                  <Text style={[s.th, { width: "44%" }]}>Descripción</Text>
                  <Text style={[s.th, { width: "22%" }]}>Fecha</Text>
                  <Text style={[s.th, { width: "16%" }]}>Estado</Text>
                </View>
                {data.incidentes.map((inc) => (
                  <View key={inc.code} style={s.tableRow} wrap={false}>
                    <Text style={[s.td, { width: "18%" }]}>{inc.code}</Text>
                    <Text style={[s.td, { width: "44%" }]}>{inc.title}</Text>
                    <Text style={[s.td, { width: "22%" }]}>
                      {formatDateTimeCl(inc.createdAt)}
                    </Text>
                    <Text style={[s.td, { width: "16%" }]}>{inc.statusLabel}</Text>
                  </View>
                ))}
              </>
            )}
          </View>
        ) : null}

        {sections.includeVisitas ? (
          <View>
            <Text style={s.h2}>Visitas de supervisión</Text>
            <VisitBlocks visits={data.visits} />
          </View>
        ) : null}

        <Footer companyName={data.companyName} />
      </Page>
    </Document>
  );
}
