import { Document, Page, Text, View } from "@react-pdf/renderer";
import { PdfHeader, sharedStyles as s, fmtCLP } from "./shared/PdfHeader";
import type { FinanceMatrixResult } from "../../shared/types";
import { splitMonths } from "../../shared/period.helper";

function buildIntensity(value: number, max: number, baseColor: string): string {
  if (max <= 0 || value <= 0) return "transparent";
  const opacity = Math.min(1, value / max);
  // approximation: append alpha hex
  const alphaHex = Math.round(opacity * 255)
    .toString(16)
    .padStart(2, "0");
  return baseColor + alphaHex;
}

export function SalesMatrixPdf({
  data,
  tenantName,
  accent = "#10B981",
  title = "Ventas por cliente · Heatmap mensual",
}: {
  data: FinanceMatrixResult;
  tenantName: string;
  accent?: string;
  title?: string;
}) {
  const generatedAt = new Date().toLocaleString("es-CL", { timeZone: "America/Santiago" });
  const months = splitMonths(data.period);
  const monthCellWidth = `${Math.max(3, Number((60 / months.length).toFixed(1)))}%`;
  const max = Math.max(...data.rows.flatMap((r) => r.monthly), 1);

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page}>
        <PdfHeader
          title={title}
          subtitle={`${data.documentsCount} DTEs · ${data.rows.length} clientes`}
          tenantName={tenantName}
          period={data.period.label}
          generatedAt={generatedAt}
        />
        <View style={s.table}>
          <View style={s.thead}>
            <Text style={[s.theadCell, { width: "25%" }]}>Cliente</Text>
            {months.map((m) => (
              <Text
                key={m.key}
                style={[s.theadCell, { width: monthCellWidth, textAlign: "right" }]}
              >
                {m.label}
              </Text>
            ))}
            <Text style={[s.theadCell, { width: "12%", textAlign: "right" }]}>Total</Text>
          </View>
          {data.rows.map((row) => (
            <View key={row.id} style={s.row}>
              <Text style={[s.cell, { width: "25%" }]}>{row.label}</Text>
              {row.monthly.map((v, i) => (
                <Text
                  key={i}
                  style={[
                    s.cellRight,
                    {
                      width: monthCellWidth,
                      backgroundColor: buildIntensity(v, max, accent),
                    },
                  ]}
                >
                  {v ? fmtCLP(v) : ""}
                </Text>
              ))}
              <Text style={[s.cellRight, { width: "12%", fontWeight: "bold" }]}>
                {fmtCLP(row.total)}
              </Text>
            </View>
          ))}
          <View style={s.totalRow}>
            <Text style={[s.totalCell, { width: "25%" }]}>TOTAL</Text>
            {data.totalsByMonth.map((v, i) => (
              <Text
                key={i}
                style={[s.totalCellRight, { width: monthCellWidth }]}
              >
                {fmtCLP(v)}
              </Text>
            ))}
            <Text style={[s.totalCellRight, { width: "12%" }]}>{fmtCLP(data.grandTotal)}</Text>
          </View>
        </View>
        <Text style={s.footer}>OPAI · Finanzas — Confidencial.</Text>
      </Page>
    </Document>
  );
}
