import { Document, Page, Text, View } from "@react-pdf/renderer";
import { PdfHeader, sharedStyles as s, fmtCLP } from "./shared/PdfHeader";
import type { IncomeStatementResult, IncomeStatementSection } from "../../shared/types";

interface SectionProps {
  label: string;
  items: IncomeStatementSection["items"];
  total: number;
  prevTotal?: number;
  comparison: boolean;
}

function Section({ label, items, total, prevTotal, comparison }: SectionProps) {
  return (
    <View>
      <Text style={s.sectionTitle}>{label}</Text>
      {items.map((it) => (
        <View key={it.accountId} style={s.row}>
          <Text style={[s.cell, { flex: 1 }]}>
            {it.accountCode} · {it.accountName}
          </Text>
          {comparison && (
            <Text style={[s.cellRight, { width: "20%" }]}>{fmtCLP(it.prevAmount ?? 0)}</Text>
          )}
          <Text style={[s.cellRight, { width: "20%" }]}>{fmtCLP(it.amount)}</Text>
        </View>
      ))}
      <View style={s.totalRow}>
        <Text style={[s.totalCell, { flex: 1 }]}>Total {label}</Text>
        {comparison && (
          <Text style={[s.totalCellRight, { width: "20%" }]}>{fmtCLP(prevTotal ?? 0)}</Text>
        )}
        <Text style={[s.totalCellRight, { width: "20%" }]}>{fmtCLP(total)}</Text>
      </View>
    </View>
  );
}

interface TotalLineProps {
  label: string;
  value: number;
  prev?: number;
  comparison: boolean;
  accent: string;
  big?: boolean;
}

function TotalLine({ label, value, prev, comparison, accent, big }: TotalLineProps) {
  const fontSize = big ? 10 : 8;
  return (
    <View style={[s.totalRow, big ? { backgroundColor: accent + "20", marginTop: 4 } : {}]}>
      <Text style={[s.totalCell, { flex: 1, color: accent, fontSize }]}>{label}</Text>
      {comparison && (
        <Text style={[s.totalCellRight, { width: "20%", color: accent, fontSize }]}>
          {fmtCLP(prev ?? 0)}
        </Text>
      )}
      <Text style={[s.totalCellRight, { width: "20%", color: accent, fontSize }]}>
        {fmtCLP(value)}
      </Text>
    </View>
  );
}

export function IncomeStatementPdf({
  data,
  tenantName,
}: {
  data: IncomeStatementResult;
  tenantName: string;
}) {
  const generatedAt = new Date().toLocaleString("es-CL", { timeZone: "America/Santiago" });
  const comparison = !!data.comparison;
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <PdfHeader
          title="Estado de Resultado"
          subtitle={comparison ? `Comparativo vs. ${data.comparison!.prev.label}` : "Período actual"}
          tenantName={tenantName}
          period={data.period.label}
          generatedAt={generatedAt}
        />
        <View style={s.table}>
          <View style={s.thead}>
            <Text style={[s.theadCell, { flex: 1 }]}>Cuenta</Text>
            {comparison && (
              <Text style={[s.theadCell, { width: "20%", textAlign: "right" }]}>
                {data.comparison!.prev.label}
              </Text>
            )}
            <Text style={[s.theadCell, { width: "20%", textAlign: "right" }]}>
              {data.period.label}
            </Text>
          </View>
          <Section
            label={data.revenue.label}
            items={data.revenue.items}
            total={data.revenue.total}
            prevTotal={data.revenue.prevTotal}
            comparison={comparison}
          />
          <Section
            label={data.cogs.label}
            items={data.cogs.items}
            total={data.cogs.total}
            prevTotal={data.cogs.prevTotal}
            comparison={comparison}
          />
          <TotalLine
            label="MARGEN BRUTO"
            value={data.grossProfit}
            prev={data.prevGrossProfit}
            comparison={comparison}
            accent="#10B981"
          />
          <Section
            label={data.opex.label}
            items={data.opex.items}
            total={data.opex.total}
            prevTotal={data.opex.prevTotal}
            comparison={comparison}
          />
          <TotalLine
            label="EBITDA"
            value={data.ebitda}
            prev={data.prevEbitda}
            comparison={comparison}
            accent="#0066FF"
            big
          />
          <Section
            label={data.financialResult.label}
            items={data.financialResult.items}
            total={data.financialResult.total}
            prevTotal={data.financialResult.prevTotal}
            comparison={comparison}
          />
          <Section
            label={data.taxes.label}
            items={data.taxes.items}
            total={data.taxes.total}
            prevTotal={data.taxes.prevTotal}
            comparison={comparison}
          />
          <TotalLine
            label="UTILIDAD NETA"
            value={data.netIncome}
            prev={data.prevNetIncome}
            comparison={comparison}
            accent="#10B981"
            big
          />
        </View>
        <Text style={s.footer}>
          OPAI · Finanzas — Estado de Resultado generado automáticamente. Confidencial.
        </Text>
      </Page>
    </Document>
  );
}
