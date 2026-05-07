import { Document, Page, Text, View } from "@react-pdf/renderer";
import { PdfHeader, sharedStyles as s, fmtCLP } from "./shared/PdfHeader";
import type { DashboardKpis } from "../../shared/types";

function KpiBox({
  label,
  value,
  delta,
  sub,
  tone,
}: {
  label: string;
  value: string;
  delta?: number;
  sub?: string;
  tone: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        margin: 4,
        padding: 8,
        borderRadius: 4,
        borderLeftWidth: 3,
        borderLeftColor: tone,
        backgroundColor: "#F9FAFC",
      }}
    >
      <Text style={{ fontSize: 7, color: "#6B7585" }}>{label}</Text>
      <Text style={{ fontSize: 12, fontWeight: "bold", color: tone, marginTop: 2 }}>{value}</Text>
      {delta !== undefined && (
        <Text style={{ fontSize: 7, color: delta >= 0 ? "#10B981" : "#F43F5E" }}>
          {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%
        </Text>
      )}
      {sub && <Text style={{ fontSize: 6, color: "#94A3B8" }}>{sub}</Text>}
    </View>
  );
}

export function DashboardPdf({
  data,
  tenantName,
}: {
  data: DashboardKpis;
  tenantName: string;
}) {
  const generatedAt = new Date().toLocaleString("es-CL", { timeZone: "America/Santiago" });
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <PdfHeader
          title="Dashboard ejecutivo"
          subtitle="KPIs financieros consolidados"
          tenantName={tenantName}
          period={data.period.label}
          generatedAt={generatedAt}
        />
        <View style={{ flexDirection: "row", marginBottom: 6 }}>
          <KpiBox
            label="Ingresos"
            value={fmtCLP(data.revenue.value)}
            delta={data.revenue.deltaPct}
            tone="#10B981"
          />
          <KpiBox
            label="EBITDA"
            value={fmtCLP(data.ebitda.value)}
            delta={data.ebitda.deltaPct}
            sub={`Margen ${data.ebitda.marginPct.toFixed(1)}%`}
            tone="#0066FF"
          />
        </View>
        <View style={{ flexDirection: "row", marginBottom: 6 }}>
          <KpiBox
            label="Utilidad neta"
            value={fmtCLP(data.netIncome.value)}
            delta={data.netIncome.deltaPct}
            sub={`Margen ${data.netIncome.marginPct.toFixed(1)}%`}
            tone="#10B981"
          />
          <KpiBox
            label="DSO"
            value={`${data.dso.value} días`}
            tone="#F59E0B"
          />
        </View>
        <View style={{ flexDirection: "row", marginBottom: 12 }}>
          <KpiBox
            label="Cuentas por cobrar"
            value={fmtCLP(data.accountsReceivable.value)}
            sub={`${data.accountsReceivable.activeInvoices} facturas`}
            tone="#8B5CF6"
          />
          <KpiBox
            label="Cuentas por pagar"
            value={fmtCLP(data.accountsPayable.value)}
            sub={`${data.accountsPayable.activeInvoices} facturas`}
            tone="#F43F5E"
          />
        </View>

        <Text style={s.sectionTitle}>Top 5 clientes</Text>
        <View style={s.table}>
          <View style={s.thead}>
            <Text style={[s.theadCell, { flex: 1 }]}>Cliente</Text>
            <Text style={[s.theadCell, { width: "20%", textAlign: "right" }]}>Total</Text>
            <Text style={[s.theadCell, { width: "15%", textAlign: "right" }]}>%</Text>
          </View>
          {data.topClients.map((c) => (
            <View key={c.id} style={s.row}>
              <Text style={[s.cell, { flex: 1 }]}>{c.name}</Text>
              <Text style={[s.cellRight, { width: "20%" }]}>{fmtCLP(c.total)}</Text>
              <Text style={[s.cellRight, { width: "15%" }]}>{c.pct.toFixed(1)}%</Text>
            </View>
          ))}
          <View style={s.totalRow}>
            <Text style={[s.totalCell, { flex: 1 }]}>Concentración</Text>
            <Text style={[s.totalCellRight, { width: "20%" }]}>
              {fmtCLP(data.topClientsConcentration.topNTotal)}
            </Text>
            <Text style={[s.totalCellRight, { width: "15%" }]}>
              {data.topClientsConcentration.pct.toFixed(1)}%
            </Text>
          </View>
        </View>
        <Text style={{ ...s.cell, marginTop: 6, color: "#6B7585" }}>
          HHI (Herfindahl-Hirschman): {data.topClientsConcentration.hhi}
        </Text>

        <Text style={{ ...s.sectionTitle, marginTop: 16 }}>Tendencia mensual (últimos 12 meses)</Text>
        <View style={s.table}>
          <View style={s.thead}>
            <Text style={[s.theadCell, { flex: 1 }]}>Mes</Text>
            <Text style={[s.theadCell, { width: "20%", textAlign: "right" }]}>Ingresos</Text>
            <Text style={[s.theadCell, { width: "20%", textAlign: "right" }]}>Gastos</Text>
            <Text style={[s.theadCell, { width: "20%", textAlign: "right" }]}>Margen</Text>
          </View>
          {data.trendMonthly.map((m, i) => (
            <View key={i} style={s.row}>
              <Text style={[s.cell, { flex: 1 }]}>{m.month}</Text>
              <Text style={[s.cellRight, { width: "20%" }]}>{fmtCLP(m.revenue)}</Text>
              <Text style={[s.cellRight, { width: "20%" }]}>{fmtCLP(m.expense)}</Text>
              <Text style={[s.cellRight, { width: "20%" }]}>{fmtCLP(m.margin)}</Text>
            </View>
          ))}
        </View>
        <Text style={s.footer}>OPAI · Finanzas — Confidencial.</Text>
      </Page>
    </Document>
  );
}
