import { Document, Page, Text, View } from "@react-pdf/renderer";
import { PdfHeader, sharedStyles as s, fmtCLP } from "./shared/PdfHeader";
import type { LedgerResult } from "../../shared/types";

export function LedgerPdf({
  data,
  tenantName,
}: {
  data: LedgerResult;
  tenantName: string;
}) {
  const generatedAt = new Date().toLocaleString("es-CL", { timeZone: "America/Santiago" });
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page}>
        <PdfHeader
          title={`Libro Mayor · ${data.account.code} ${data.account.name}`}
          subtitle={`${data.entries.length} movimientos · saldo final ${fmtCLP(data.closingBalance)}`}
          tenantName={tenantName}
          period={data.period.label}
          generatedAt={generatedAt}
        />
        <View style={s.table}>
          <View style={s.thead}>
            <Text style={[s.theadCell, { width: "9%" }]}>Fecha</Text>
            <Text style={[s.theadCell, { width: "5%" }]}>N°</Text>
            <Text style={[s.theadCell, { flex: 1 }]}>Descripción</Text>
            <Text style={[s.theadCell, { width: "10%" }]}>Ref.</Text>
            <Text style={[s.theadCell, { width: "12%" }]}>CC</Text>
            <Text style={[s.theadCell, { width: "10%", textAlign: "right" }]}>Debe</Text>
            <Text style={[s.theadCell, { width: "10%", textAlign: "right" }]}>Haber</Text>
            <Text style={[s.theadCell, { width: "10%", textAlign: "right" }]}>Saldo</Text>
          </View>
          <View style={s.row}>
            <Text style={[s.cell, { flex: 1, fontStyle: "italic", color: "#6B7585" }]}>
              Saldo inicial
            </Text>
            <Text style={[s.cellRight, { width: "10%", color: "#6B7585" }]}>
              {fmtCLP(data.openingBalance)}
            </Text>
          </View>
          {data.entries.map((e, i) => (
            <View key={i} style={s.row}>
              <Text style={[s.cell, { width: "9%" }]}>{e.date}</Text>
              <Text style={[s.cell, { width: "5%" }]}>{e.entryNumber}</Text>
              <Text style={[s.cell, { flex: 1 }]}>{e.description}</Text>
              <Text style={[s.cell, { width: "10%" }]}>{e.reference ?? "—"}</Text>
              <Text style={[s.cell, { width: "12%" }]}>{e.costCenterName ?? "—"}</Text>
              <Text style={[s.cellRight, { width: "10%" }]}>{e.debit ? fmtCLP(e.debit) : ""}</Text>
              <Text style={[s.cellRight, { width: "10%" }]}>
                {e.credit ? fmtCLP(e.credit) : ""}
              </Text>
              <Text style={[s.cellRight, { width: "10%" }]}>{fmtCLP(e.runningBalance)}</Text>
            </View>
          ))}
          <View style={s.totalRow}>
            <Text style={[s.totalCell, { flex: 1 }]}>TOTAL</Text>
            <Text style={[s.totalCellRight, { width: "10%" }]}>{fmtCLP(data.totalDebit)}</Text>
            <Text style={[s.totalCellRight, { width: "10%" }]}>{fmtCLP(data.totalCredit)}</Text>
            <Text style={[s.totalCellRight, { width: "10%" }]}>{fmtCLP(data.closingBalance)}</Text>
          </View>
        </View>
        <Text style={s.footer}>OPAI · Finanzas — Confidencial.</Text>
      </Page>
    </Document>
  );
}
