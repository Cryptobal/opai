import { Document, Page, Text, View } from "@react-pdf/renderer";
import { PdfHeader, sharedStyles as s, fmtCLP } from "./shared/PdfHeader";
import type { ProfitabilityResult } from "../../shared/types";

export function ProfitabilityPdf({
  data,
  tenantName,
}: {
  data: ProfitabilityResult;
  tenantName: string;
}) {
  const generatedAt = new Date().toLocaleString("es-CL", { timeZone: "America/Santiago" });
  const maxAbsMargin = Math.max(...data.rows.map((r) => Math.abs(r.margin)), 1);

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <PdfHeader
          title="Rentabilidad por cliente"
          subtitle={`${data.rows.length} clientes · método: ${data.opexAllocationMethod}`}
          tenantName={tenantName}
          period={data.period.label}
          generatedAt={generatedAt}
        />
        <View style={s.table}>
          <View style={s.thead}>
            <Text style={[s.theadCell, { width: "5%" }]}>#</Text>
            <Text style={[s.theadCell, { flex: 1 }]}>Cliente</Text>
            <Text style={[s.theadCell, { width: "12%", textAlign: "right" }]}>Ventas</Text>
            <Text style={[s.theadCell, { width: "12%", textAlign: "right" }]}>Costo</Text>
            <Text style={[s.theadCell, { width: "12%", textAlign: "right" }]}>Opex</Text>
            <Text style={[s.theadCell, { width: "13%", textAlign: "right" }]}>Margen</Text>
            <Text style={[s.theadCell, { width: "10%", textAlign: "right" }]}>%</Text>
          </View>
          {data.rows.map((row, i) => {
            const tone = row.margin >= 0 ? "#10B981" : "#F43F5E";
            const barWidth = (Math.abs(row.margin) / maxAbsMargin) * 100;
            return (
              <View key={row.crmAccountId} style={s.row}>
                <Text style={[s.cell, { width: "5%" }]}>{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.cell}>{row.clientName}</Text>
                  <View
                    style={{
                      height: 2,
                      width: `${barWidth}%`,
                      backgroundColor: tone,
                      marginTop: 1,
                    }}
                  />
                </View>
                <Text style={[s.cellRight, { width: "12%" }]}>{fmtCLP(row.revenue)}</Text>
                <Text style={[s.cellRight, { width: "12%" }]}>{fmtCLP(row.directCost)}</Text>
                <Text style={[s.cellRight, { width: "12%" }]}>{fmtCLP(row.allocatedOpex)}</Text>
                <Text style={[s.cellRight, { width: "13%", color: tone, fontWeight: "bold" }]}>
                  {fmtCLP(row.margin)}
                </Text>
                <Text style={[s.cellRight, { width: "10%", color: tone }]}>
                  {row.marginPct.toFixed(1)}%
                </Text>
              </View>
            );
          })}
          <View style={s.totalRow}>
            <Text style={[s.totalCell, { width: "5%" }]}></Text>
            <Text style={[s.totalCell, { flex: 1 }]}>TOTAL</Text>
            <Text style={[s.totalCellRight, { width: "12%" }]}>{fmtCLP(data.totals.revenue)}</Text>
            <Text style={[s.totalCellRight, { width: "12%" }]}>
              {fmtCLP(data.totals.directCost)}
            </Text>
            <Text style={[s.totalCellRight, { width: "12%" }]}>
              {fmtCLP(data.totals.allocatedOpex)}
            </Text>
            <Text style={[s.totalCellRight, { width: "13%" }]}>{fmtCLP(data.totals.margin)}</Text>
            <Text style={[s.totalCellRight, { width: "10%" }]}>
              {data.totals.marginPct.toFixed(1)}%
            </Text>
          </View>
        </View>
        <Text style={s.footer}>OPAI · Finanzas — Confidencial.</Text>
      </Page>
    </Document>
  );
}
