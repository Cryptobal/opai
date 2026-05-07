import { Document, Page, Text, View } from "@react-pdf/renderer";
import { PdfHeader, sharedStyles as s, fmtCLP } from "./shared/PdfHeader";
import type { BalanceSheetResult, BalanceSheetSection } from "../../shared/types";

function Section({ section, prevAsOf }: { section: BalanceSheetSection; prevAsOf?: string }) {
  return (
    <View>
      <Text style={s.sectionTitle}>{section.label}</Text>
      {section.items.map((it) => (
        <View key={it.accountId} style={s.row}>
          <Text style={[s.cell, { flex: 1 }]}>
            {it.accountCode} · {it.accountName}
          </Text>
          {prevAsOf && (
            <Text style={[s.cellRight, { width: "25%" }]}>{fmtCLP(it.prevAmount ?? 0)}</Text>
          )}
          <Text style={[s.cellRight, { width: "25%" }]}>{fmtCLP(it.amount)}</Text>
        </View>
      ))}
      <View style={s.totalRow}>
        <Text style={[s.totalCell, { flex: 1 }]}>Total {section.label}</Text>
        {prevAsOf && (
          <Text style={[s.totalCellRight, { width: "25%" }]}>{fmtCLP(section.prevTotal ?? 0)}</Text>
        )}
        <Text style={[s.totalCellRight, { width: "25%" }]}>{fmtCLP(section.total)}</Text>
      </View>
    </View>
  );
}

export function BalanceSheetPdf({
  data,
  tenantName,
}: {
  data: BalanceSheetResult;
  tenantName: string;
}) {
  const generatedAt = new Date().toLocaleString("es-CL", { timeZone: "America/Santiago" });
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <PdfHeader
          title="Balance General"
          subtitle={data.prevAsOf ? `Comparativo vs. ${data.prevAsOf}` : "Período actual"}
          tenantName={tenantName}
          period={`Al ${data.asOf}`}
          generatedAt={generatedAt}
        />
        <View style={s.table}>
          <View style={s.thead}>
            <Text style={[s.theadCell, { flex: 1 }]}>Cuenta</Text>
            {data.prevAsOf && (
              <Text style={[s.theadCell, { width: "25%", textAlign: "right" }]}>
                Al {data.prevAsOf}
              </Text>
            )}
            <Text style={[s.theadCell, { width: "25%", textAlign: "right" }]}>Al {data.asOf}</Text>
          </View>

          <Text style={{ ...s.sectionTitle, fontSize: 11 }}>ACTIVO</Text>
          <Section section={data.asset.current} prevAsOf={data.prevAsOf} />
          <Section section={data.asset.nonCurrent} prevAsOf={data.prevAsOf} />
          <View style={[s.totalRow, { backgroundColor: "#0066FF20" }]}>
            <Text style={[s.totalCell, { flex: 1, color: "#0066FF", fontSize: 9 }]}>
              TOTAL ACTIVO
            </Text>
            {data.prevAsOf && (
              <Text style={[s.totalCellRight, { width: "25%", color: "#0066FF" }]}>
                {fmtCLP(data.asset.prevTotal ?? 0)}
              </Text>
            )}
            <Text style={[s.totalCellRight, { width: "25%", color: "#0066FF" }]}>
              {fmtCLP(data.asset.total)}
            </Text>
          </View>

          <Text style={{ ...s.sectionTitle, fontSize: 11, marginTop: 12 }}>PASIVO</Text>
          <Section section={data.liability.current} prevAsOf={data.prevAsOf} />
          <Section section={data.liability.nonCurrent} prevAsOf={data.prevAsOf} />
          <View style={[s.totalRow, { backgroundColor: "#F5970020" }]}>
            <Text style={[s.totalCell, { flex: 1, color: "#F59E0B", fontSize: 9 }]}>
              TOTAL PASIVO
            </Text>
            {data.prevAsOf && (
              <Text style={[s.totalCellRight, { width: "25%", color: "#F59E0B" }]}>
                {fmtCLP(data.liability.prevTotal ?? 0)}
              </Text>
            )}
            <Text style={[s.totalCellRight, { width: "25%", color: "#F59E0B" }]}>
              {fmtCLP(data.liability.total)}
            </Text>
          </View>

          <Text style={{ ...s.sectionTitle, fontSize: 11, marginTop: 12 }}>PATRIMONIO</Text>
          <Section section={data.equity} prevAsOf={data.prevAsOf} />
        </View>
        <Text style={s.footer}>
          {data.isBalanced
            ? "Balance cuadrado: Activo = Pasivo + Patrimonio."
            : `Diferencia detectada: ${fmtCLP(data.imbalance)}.`}
        </Text>
      </Page>
    </Document>
  );
}
