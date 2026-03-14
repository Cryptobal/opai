/**
 * QuotationPDF — CPQ quotation document with conditional sections per template.
 *
 * Templates: Standard (default), Detailed, Tender (Licitación)
 *
 * IMPORTANT: Changes here MUST be replicated in render-quotation.ts
 */

import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { pdfColors, pdfFonts, pdfSpacing } from '../../core/theme';
import {
  PDFHeader,
  PDFAccentLine,
  PDFInfoStrip,
  PDFSectionTitle,
  PDFTable,
  PDFGrandTotal,
  PDFConditionCard,
  PDFFooter,
  PDFSignatureArea,
  PDFContactBanner,
} from '../../core/components';
import type { QuotationPDFProps } from './render-quotation';
import type { QuoteBreakdownData } from '@/types/cpq-breakdown';
export type { QuotationPDFProps } from './render-quotation';

/* ─── Local styles ─── */

const ls = StyleSheet.create({
  page: {
    fontFamily: pdfFonts.sans,
    fontSize: 9,
    color: pdfColors.slate700,
    backgroundColor: pdfColors.white,
    paddingBottom: 50,
  },
  body: {
    paddingHorizontal: pdfSpacing.page,
  },
  description: {
    fontFamily: pdfFonts.sans,
    fontSize: 10,
    color: pdfColors.slate700,
    padding: 12,
    paddingLeft: 14,
    backgroundColor: pdfColors.slate50,
    borderRadius: 4,
    marginTop: 10,
    marginBottom: 4,
    lineHeight: 1.6,
    borderLeftWidth: 3,
    borderLeftColor: pdfColors.teal,
  },
  serviceDetail: {
    fontFamily: pdfFonts.sans,
    fontSize: 9,
    color: pdfColors.slate700,
    lineHeight: 1.5,
    marginTop: 6,
  },
  conditionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  conditionCardWrapper: {
    width: '48%',
  },
  bulletItem: {
    flexDirection: 'row',
    marginBottom: 5,
    paddingLeft: 4,
  },
  bulletDot: {
    fontFamily: pdfFonts.sans,
    fontSize: 9,
    color: pdfColors.teal,
    fontWeight: 700,
    marginRight: 6,
    width: 8,
  },
  bulletText: {
    fontFamily: pdfFonts.sans,
    fontSize: 9,
    color: pdfColors.slate700,
    flex: 1,
  },
  netNote: {
    fontFamily: pdfFonts.sans,
    fontSize: 7,
    color: pdfColors.slate400,
    marginTop: 4,
    textAlign: 'right',
  },
  /* ── Breakdown page styles ── */
  bdSection: {
    marginBottom: 10,
    borderRadius: 4,
    overflow: 'hidden',
  },
  bdSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 8,
    backgroundColor: pdfColors.slate50,
    borderRadius: 4,
    marginBottom: 2,
  },
  bdSectionTitle: {
    fontFamily: pdfFonts.sans,
    fontSize: 8,
    fontWeight: 700,
    color: pdfColors.slate700,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bdRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2.5,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: pdfColors.slate50,
  },
  bdRowLabel: {
    fontFamily: pdfFonts.sans,
    fontSize: 8,
    color: pdfColors.slate700,
  },
  bdRowAmount: {
    fontFamily: pdfFonts.sans,
    fontSize: 8,
    color: pdfColors.slate700,
    fontWeight: 600,
  },
  bdSubRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
    paddingHorizontal: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: pdfColors.slate50,
  },
  bdSubLabel: {
    fontFamily: pdfFonts.sans,
    fontSize: 7.5,
    color: pdfColors.slate400,
  },
  bdSubAmount: {
    fontFamily: pdfFonts.sans,
    fontSize: 7.5,
    color: pdfColors.slate400,
  },
  bdSeparator: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: pdfColors.slate50,
    borderRadius: 2,
    marginVertical: 3,
  },
  bdSepLabel: {
    fontFamily: pdfFonts.sans,
    fontSize: 8,
    fontWeight: 700,
    color: pdfColors.slate700,
  },
  bdTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 10,
    backgroundColor: '#0f766e',
    borderRadius: 4,
    marginTop: 6,
  },
  bdTotalLabel: {
    fontFamily: pdfFonts.sans,
    fontSize: 10,
    fontWeight: 700,
    color: '#ffffff',
  },
  bdTotalAmount: {
    fontFamily: pdfFonts.sans,
    fontSize: 11,
    fontWeight: 700,
    color: '#ffffff',
  },
  bdMarginBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    paddingHorizontal: 8,
    backgroundColor: '#d1fae5',
    borderRadius: 4,
    marginTop: 4,
  },
  bdMarginLabel: {
    fontFamily: pdfFonts.sans,
    fontSize: 8,
    fontWeight: 700,
    color: '#065f46',
  },
  bdFinBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    paddingHorizontal: 8,
    backgroundColor: '#fff7ed',
    borderRadius: 4,
    marginTop: 4,
  },
  bdFinLabel: {
    fontFamily: pdfFonts.sans,
    fontSize: 8,
    fontWeight: 700,
    color: '#9a3412',
  },
  posCard: {
    marginBottom: 8,
    borderWidth: 0.5,
    borderColor: pdfColors.slate200,
    borderRadius: 4,
    overflow: 'hidden',
  },
  posCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 8,
    backgroundColor: pdfColors.slate50,
  },
  posCardName: {
    fontFamily: pdfFonts.sans,
    fontSize: 9,
    fontWeight: 700,
    color: pdfColors.slate700,
  },
  posCardPrice: {
    fontFamily: pdfFonts.sans,
    fontSize: 9,
    fontWeight: 700,
    color: '#0d9488',
  },
  posCardMeta: {
    fontFamily: pdfFonts.sans,
    fontSize: 7.5,
    color: pdfColors.slate400,
    marginTop: 1,
  },
  posCardBody: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  /* ── Labor detail styles ── */
  laborRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: pdfColors.slate100,
  },
  laborLabel: {
    fontFamily: pdfFonts.sans,
    fontSize: 8.5,
    color: pdfColors.slate700,
  },
  laborValue: {
    fontFamily: pdfFonts.sans,
    fontSize: 8.5,
    fontWeight: 600,
    color: pdfColors.slate700,
  },
  /* ── Cost category styles ── */
  catSection: {
    marginBottom: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  catHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 8,
    backgroundColor: pdfColors.slate100,
    borderRadius: 4,
    marginBottom: 2,
  },
  catTitle: {
    fontFamily: pdfFonts.sans,
    fontSize: 8.5,
    fontWeight: 700,
    color: pdfColors.slate700,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  catAmount: {
    fontFamily: pdfFonts.sans,
    fontSize: 8.5,
    fontWeight: 700,
    color: pdfColors.slate700,
  },
  catItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
    paddingHorizontal: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: pdfColors.slate50,
  },
  catItemLabel: {
    fontFamily: pdfFonts.sans,
    fontSize: 7.5,
    color: pdfColors.slate400,
  },
  catItemAmount: {
    fontFamily: pdfFonts.sans,
    fontSize: 7.5,
    color: pdfColors.slate400,
  },
  /* ── Compliance styles ── */
  complianceItem: {
    flexDirection: 'row',
    marginBottom: 4,
    paddingLeft: 4,
  },
  complianceCheck: {
    fontFamily: pdfFonts.sans,
    fontSize: 9,
    color: '#0d9488',
    fontWeight: 700,
    marginRight: 6,
    width: 10,
  },
  complianceText: {
    fontFamily: pdfFonts.sans,
    fontSize: 9,
    color: pdfColors.slate700,
    flex: 1,
  },
  /* ── Numbered section title ── */
  numberedTitle: {
    fontFamily: pdfFonts.sans,
    fontSize: 11,
    fontWeight: 700,
    color: pdfColors.navy || '#0f172a',
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: pdfColors.slate200,
    marginBottom: 8,
    marginTop: 16,
  },
});

/* ─── Payment terms label ─── */
const PAYMENT_LABELS: Record<string, string> = {
  contrafactura: 'Contra factura',
  '30dias': '30 días',
  anticipado: 'Pago anticipado',
};

/* ─── Helpers ─── */

function fmtCLPPdf(n: number) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}

function fmtUFPdf(n: number) {
  return `${n.toFixed(2)} UF`;
}

function fmtBreakdown(n: number, currency: string, ufValue?: number) {
  if (currency === 'UF' && ufValue && ufValue > 0) {
    return fmtUFPdf(n / ufValue);
  }
  return fmtCLPPdf(n);
}

function getBrandName(companyConfig: QuotationPDFProps['companyConfig']): string {
  return companyConfig.brandNameUpper ?? companyConfig.commercialName?.toUpperCase() ?? 'EMPRESA';
}

/* ─── Section title with optional numbering ─── */

function SectionTitle({ children, numbered, num }: { children: string; numbered: boolean; num?: number }) {
  if (numbered && num != null) {
    return <Text style={ls.numberedTitle}>{`${num}. ${children}`}</Text>;
  }
  return <PDFSectionTitle>{children}</PDFSectionTitle>;
}

/* ─── Breakdown page component ─── */

function BreakdownPage({
  breakdown,
  companyConfig,
  quoteCode,
  dateStr,
  pageLabel,
}: {
  breakdown: QuoteBreakdownData;
  companyConfig: QuotationPDFProps['companyConfig'];
  quoteCode: string;
  dateStr: string;
  pageLabel: string;
}) {
  const fmt = (n: number) => fmtBreakdown(n, breakdown.currency, breakdown.ufValue);

  const totalImponible = breakdown.positions.reduce((s, p) => s + p.totalImponible, 0);
  const imposiciones = breakdown.positions.reduce(
    (s, p) => s + p.sisEmployer + p.afcEmployer + p.mutualEmployer,
    0,
  );
  const provisiones = breakdown.positions.reduce(
    (s, p) => s + p.vacationProvision + p.severanceProvision,
    0,
  );

  const directCostsTotal =
    breakdown.holidayAdjustment +
    breakdown.uniforms +
    breakdown.exams +
    breakdown.meals;

  const indirectCostsTotal =
    breakdown.equipment +
    breakdown.transport +
    breakdown.vehicles +
    breakdown.infrastructure +
    breakdown.systems;

  return (
    <Page size="A4" style={ls.page}>
      <PDFHeader
        brandName={getBrandName(companyConfig)}
        subtitle="Estructura de costos transparente"
        code={quoteCode}
      />
      <PDFAccentLine />

      <View style={ls.body}>
        <PDFSectionTitle>Estructura de Costos</PDFSectionTitle>

        {/* ── Mano de Obra ── */}
        <View style={ls.bdSection}>
          <View style={ls.bdSectionHeader}>
            <Text style={[ls.bdSectionTitle, { color: '#1d4ed8' }]}>Mano de Obra</Text>
            <Text style={[ls.bdRowAmount, { color: '#1d4ed8' }]}>{fmt(breakdown.totalLaborCost)}</Text>
          </View>
          {totalImponible > 0 && (
            <View style={ls.bdSubRow}>
              <Text style={ls.bdSubLabel}>Sueldos imponibles (base + gratificación)</Text>
              <Text style={ls.bdSubAmount}>{fmt(totalImponible)}</Text>
            </View>
          )}
          {imposiciones > 0 && (
            <View style={ls.bdSubRow}>
              <Text style={ls.bdSubLabel}>Imposiciones empleador (SIS + AFC + Mutual)</Text>
              <Text style={ls.bdSubAmount}>{fmt(imposiciones)}</Text>
            </View>
          )}
          {provisiones > 0 && (
            <View style={ls.bdSubRow}>
              <Text style={ls.bdSubLabel}>Provisiones (vacaciones + finiquito)</Text>
              <Text style={ls.bdSubAmount}>{fmt(provisiones)}</Text>
            </View>
          )}
        </View>

        {/* ── Costos Directos ── */}
        {directCostsTotal > 0 && (
          <View style={ls.bdSection}>
            <View style={ls.bdSectionHeader}>
              <Text style={[ls.bdSectionTitle, { color: '#0d9488' }]}>Costos Directos</Text>
              <Text style={[ls.bdRowAmount, { color: '#0d9488' }]}>{fmt(directCostsTotal)}</Text>
            </View>
            {breakdown.holidayAdjustment > 0 && (
              <View style={ls.bdSubRow}>
                <Text style={ls.bdSubLabel}>Ajuste feriados legales</Text>
                <Text style={ls.bdSubAmount}>{fmt(breakdown.holidayAdjustment)}</Text>
              </View>
            )}
            {breakdown.uniforms > 0 && (
              <View style={ls.bdSubRow}>
                <Text style={ls.bdSubLabel}>Uniformes</Text>
                <Text style={ls.bdSubAmount}>{fmt(breakdown.uniforms)}</Text>
              </View>
            )}
            {breakdown.exams > 0 && (
              <View style={ls.bdSubRow}>
                <Text style={ls.bdSubLabel}>Exámenes médicos</Text>
                <Text style={ls.bdSubAmount}>{fmt(breakdown.exams)}</Text>
              </View>
            )}
            {breakdown.meals > 0 && (
              <View style={ls.bdSubRow}>
                <Text style={ls.bdSubLabel}>Alimentación</Text>
                <Text style={ls.bdSubAmount}>{fmt(breakdown.meals)}</Text>
              </View>
            )}
          </View>
        )}

        {/* ── Costos Indirectos ── */}
        {indirectCostsTotal > 0 && (
          <View style={ls.bdSection}>
            <View style={ls.bdSectionHeader}>
              <Text style={[ls.bdSectionTitle, { color: '#b45309' }]}>Costos Indirectos</Text>
              <Text style={[ls.bdRowAmount, { color: '#b45309' }]}>{fmt(indirectCostsTotal)}</Text>
            </View>
            {breakdown.equipment > 0 && (
              <View style={ls.bdSubRow}>
                <Text style={ls.bdSubLabel}>Equipo operativo</Text>
                <Text style={ls.bdSubAmount}>{fmt(breakdown.equipment)}</Text>
              </View>
            )}
            {breakdown.transport > 0 && (
              <View style={ls.bdSubRow}>
                <Text style={ls.bdSubLabel}>Transporte</Text>
                <Text style={ls.bdSubAmount}>{fmt(breakdown.transport)}</Text>
              </View>
            )}
            {breakdown.vehicles > 0 && (
              <View style={ls.bdSubRow}>
                <Text style={ls.bdSubLabel}>Vehículos</Text>
                <Text style={ls.bdSubAmount}>{fmt(breakdown.vehicles)}</Text>
              </View>
            )}
            {breakdown.infrastructure > 0 && (
              <View style={ls.bdSubRow}>
                <Text style={ls.bdSubLabel}>Infraestructura</Text>
                <Text style={ls.bdSubAmount}>{fmt(breakdown.infrastructure)}</Text>
              </View>
            )}
            {breakdown.systems > 0 && (
              <View style={ls.bdSubRow}>
                <Text style={ls.bdSubLabel}>Sistemas</Text>
                <Text style={ls.bdSubAmount}>{fmt(breakdown.systems)}</Text>
              </View>
            )}
          </View>
        )}

        {/* ── Subtotal base ── */}
        <View style={ls.bdSeparator}>
          <Text style={ls.bdSepLabel}>Subtotal costos base</Text>
          <Text style={ls.bdSepLabel}>{fmt(breakdown.subtotalBase)}</Text>
        </View>

        {/* ── Margen ── */}
        <View style={ls.bdMarginBox}>
          <Text style={ls.bdMarginLabel}>Margen comercial ({breakdown.marginPct}% sobre precio venta)</Text>
          <Text style={ls.bdMarginLabel}>{fmt(breakdown.marginAmount)}</Text>
        </View>

        {/* ── Financiero ── */}
        {breakdown.financial > 0 && (
          <View style={ls.bdFinBox}>
            <Text style={ls.bdFinLabel}>Costo financiero ({breakdown.financialRatePct}%)</Text>
            <Text style={ls.bdFinLabel}>{fmt(breakdown.financial)}</Text>
          </View>
        )}

        {/* ── Grand Total ── */}
        <View style={ls.bdTotal}>
          <Text style={ls.bdTotalLabel}>PRECIO VENTA MENSUAL NETO</Text>
          <Text style={ls.bdTotalAmount}>{fmt(breakdown.grandTotal)}</Text>
        </View>

        {/* ── Valor hora por puesto ── */}
        {breakdown.positions.length > 0 && (
          <>
            <PDFSectionTitle>Valor Hora de Venta por Puesto</PDFSectionTitle>
            {breakdown.positions.map((pos) => (
              <View key={pos.id} style={ls.posCard}>
                <View style={ls.posCardHeader}>
                  <View>
                    <Text style={ls.posCardName}>{pos.name}</Text>
                    <Text style={ls.posCardMeta}>
                      {pos.totalGuardsInPosition} guardia{pos.totalGuardsInPosition !== 1 ? 's' : ''} · {breakdown.monthlyHoursStandard}h/mes
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={ls.posCardPrice}>{fmtCLPPdf(Math.round(pos.hourlyRateSale))}/hr</Text>
                    <Text style={ls.posCardMeta}>precio venta</Text>
                  </View>
                </View>
              </View>
            ))}
          </>
        )}

        <Text style={ls.netNote}>
          Estructura de costos con transparencia total · Valores netos · IVA se factura según ley vigente
        </Text>
      </View>

      <PDFFooter website={companyConfig.website} date={dateStr} pageLabel={pageLabel} />
    </Page>
  );
}

/* ─── LaborDetailSection — Desglose de mano de obra (Detallado / Licitación) ─── */

function LaborDetailSection({
  laborBreakdown,
  numbered,
  sectionNum,
}: {
  laborBreakdown: NonNullable<QuotationPDFProps['laborBreakdown']>;
  numbered: boolean;
  sectionNum?: number;
}) {
  return (
    <>
      <SectionTitle numbered={numbered} num={sectionNum}>Detalle de Mano de Obra</SectionTitle>
      <View style={{ marginBottom: 8 }}>
        <View style={ls.laborRow}>
          <Text style={ls.laborLabel}>Sueldo bruto promedio por guardia</Text>
          <Text style={ls.laborValue}>{fmtCLPPdf(laborBreakdown.sueldoBrutoPromedio)}</Text>
        </View>
        <View style={ls.laborRow}>
          <Text style={ls.laborLabel}>Cargas sociales empleador</Text>
          <Text style={ls.laborValue}>{laborBreakdown.cargasSocialesPct}%</Text>
        </View>
        <View style={ls.laborRow}>
          <Text style={ls.laborLabel}>Gratificación legal</Text>
          <Text style={ls.laborValue}>{fmtCLPPdf(laborBreakdown.gratificacion)}</Text>
        </View>
        <View style={ls.laborRow}>
          <Text style={ls.laborLabel}>Costo total por guardia</Text>
          <Text style={ls.laborValue}>{fmtCLPPdf(laborBreakdown.totalPorGuardia)}</Text>
        </View>
        <View style={ls.laborRow}>
          <Text style={ls.laborLabel}>Total guardias</Text>
          <Text style={ls.laborValue}>{laborBreakdown.totalGuardias}</Text>
        </View>
        <View style={[ls.laborRow, { backgroundColor: pdfColors.slate50, borderBottomWidth: 0 }]}>
          <Text style={[ls.laborLabel, { fontWeight: 700 }]}>Total mensual mano de obra</Text>
          <Text style={[ls.laborValue, { fontWeight: 700 }]}>{fmtCLPPdf(laborBreakdown.totalMensual)}</Text>
        </View>
      </View>
    </>
  );
}

/* ─── CostBreakdownByCategory — Desglose por categoría (Detallado / Licitación) ─── */

function CostBreakdownByCategory({
  costsByCategory,
  fmtFn,
  numbered,
  sectionNum,
}: {
  costsByCategory: QuotationPDFProps['costsByCategory'];
  fmtFn: (n: number) => string;
  numbered: boolean;
  sectionNum?: number;
}) {
  if (!costsByCategory || costsByCategory.length === 0) return null;
  return (
    <>
      <SectionTitle numbered={numbered} num={sectionNum}>Desglose de Costos por Categoría</SectionTitle>
      {costsByCategory.map((cat, catIdx) => (
        <View key={catIdx} style={ls.catSection}>
          <View style={[ls.catHeader, cat.categoryType === 'indirect' ? { backgroundColor: '#fef3c7' } : {}]}>
            <Text style={[ls.catTitle, cat.categoryType === 'indirect' ? { color: '#b45309' } : { color: '#0d9488' }]}>
              {cat.category}
            </Text>
            <Text style={[ls.catAmount, cat.categoryType === 'indirect' ? { color: '#b45309' } : { color: '#0d9488' }]}>
              {fmtFn(cat.subtotal)}
            </Text>
          </View>
          {cat.items.map((item, itemIdx) => (
            <View key={itemIdx} style={ls.catItemRow}>
              <Text style={ls.catItemLabel}>{item.name}</Text>
              <Text style={ls.catItemAmount}>{fmtFn(item.amount)}</Text>
            </View>
          ))}
        </View>
      ))}
    </>
  );
}

/* ─── ComplianceSection — Cumplimiento normativo (Licitación) ─── */

function ComplianceSection({
  items,
  numbered,
  sectionNum,
}: {
  items: string[];
  numbered: boolean;
  sectionNum?: number;
}) {
  return (
    <>
      <SectionTitle numbered={numbered} num={sectionNum}>Cumplimiento Normativo</SectionTitle>
      <View style={{ marginBottom: 8 }}>
        {items.map((item, i) => (
          <View key={i} style={ls.complianceItem}>
            <Text style={ls.complianceCheck}>✓</Text>
            <Text style={ls.complianceText}>{item}</Text>
          </View>
        ))}
      </View>
    </>
  );
}

/* ─── AdditionalServicesDetailed — Líneas adicionales con tipo y recurrencia ─── */

function AdditionalServicesDetailed({
  lines,
  numbered,
  sectionNum,
}: {
  lines: QuotationPDFProps['additionalLines'];
  numbered: boolean;
  sectionNum?: number;
}) {
  if (!lines || lines.length === 0) return null;

  const headers = [
    { label: 'Producto / Servicio', flex: 2, align: 'left' as const },
    { label: 'Tipo', flex: 1, align: 'center' as const },
    { label: 'Recurrencia', flex: 1, align: 'center' as const },
    { label: 'Valor Mensual', flex: 1.5, align: 'right' as const },
  ];

  const rows = lines.map((l) => [
    { value: l.nombre },
    { value: l.tipo },
    { value: l.recurrencia === 'unico' ? 'Único (prorrateado)' : l.recurrencia },
    { value: l.precioVentaFmt, bold: true },
  ]);

  return (
    <>
      <SectionTitle numbered={numbered} num={sectionNum}>Servicios y Productos Adicionales</SectionTitle>
      <PDFTable headers={headers} rows={rows} />
    </>
  );
}

/* ─── Component ─── */

export function QuotationPDF(props: QuotationPDFProps) {
  const {
    quote,
    client,
    positions,
    additionalServices,
    totals,
    conditions,
    companyConfig,
    includedItems,
    aiDescription,
    serviceDetail,
    breakdown,
    templateSections: sec,
    costsByCategory,
    additionalLines,
    laborBreakdown,
    complianceItems,
  } = props;

  const dateStr = new Date().toLocaleDateString('es-CL');
  const validStr = quote.validUntil
    ? new Date(quote.validUntil).toLocaleDateString('es-CL')
    : '';

  const brandName = getBrandName(companyConfig);
  const numbered = sec.numberedSections;

  const positionHeaders = [
    { label: 'Puesto', flex: 2.5, align: 'left' as const },
    { label: 'G', flex: 0.5, align: 'center' as const },
    { label: 'Cant', flex: 0.5, align: 'center' as const },
    { label: 'Dias', flex: 1.5, align: 'left' as const },
    { label: 'Horario', flex: 1.2, align: 'left' as const },
    { label: 'Valor Mensual', flex: 1.3, align: 'right' as const },
  ];

  const positionRows = positions.map((p) => [
    { value: p.name },
    { value: String(p.guards) },
    { value: String(p.quantity) },
    { value: p.days },
    { value: p.schedule },
    { value: p.monthlyValue, bold: true },
  ]);

  const additionalHeaders = [
    { label: 'Producto / Servicio', flex: 2, align: 'left' as const },
    { label: 'Descripcion', flex: 3, align: 'left' as const },
    { label: 'Valor Mensual', flex: 1.5, align: 'right' as const },
  ];

  const additionalRows = additionalServices.map((s) => [
    { value: s.product },
    { value: s.description },
    { value: s.monthlyValue, bold: true },
  ]);

  const hasAdditional = additionalServices.length > 0;
  const hasDetailedAdditional = (additionalLines?.length ?? 0) > 0;
  const totalGuards = positions.reduce((s, p) => s + p.guards * p.quantity, 0);
  const paymentLabel = PAYMENT_LABELS[conditions.paymentTerms] || conditions.paymentTerms;

  const displayItems =
    includedItems.length > 0
      ? includedItems
      : [
          'Personal acreditado ante OS-10 de Carabineros',
          'Supervision periodica en terreno',
          'Cobertura por ausencias (reemplazo max. 4 hrs)',
          'Seguro responsabilidad civil y accidentes laborales',
          'Libro de novedades digital via OPAI',
          'Reporteria mensual de operaciones',
        ];

  const showDetailedAdditional = sec.showAdditionalServices && hasDetailedAdditional &&
    (sec.showCostBreakdown || sec.showLaborDetail);
  const showSimpleAdditional = sec.showAdditionalServices && hasAdditional && !showDetailedAdditional;

  const fmtCat = (n: number) => {
    if (breakdown) return fmtBreakdown(n, breakdown.currency, breakdown.ufValue);
    return fmtCLPPdf(n);
  };

  /* ── Page count ── */
  let pageCount = 1;
  if (sec.showConditions || sec.showIncludedItems || sec.showSignature) pageCount++;
  if (breakdown && sec.showCostSummaryByCategory) pageCount++;
  if (sec.showLaborDetail && laborBreakdown) pageCount = Math.max(pageCount, 3);
  if (sec.showComplianceSection && complianceItems) pageCount = Math.max(pageCount, 3);

  let currentPage = 0;

  /* ── Numbered section counter ── */
  let sectionCounter = 0;
  const nextNum = () => ++sectionCounter;

  return (
    <Document>
      {/* ─── PAGE 1: Propuesta Económica ─── */}
      <Page size="A4" style={ls.page}>
        <PDFHeader
          brandName={brandName}
          subtitle={sec.headerStyle === 'formal' ? `Cotización N° ${quote.code}` : 'Servicios de seguridad integral'}
          code={quote.code}
        />
        <PDFAccentLine />

        <PDFInfoStrip
          items={[
            { label: 'Cliente', value: client.name },
            { label: 'Negocio', value: client.dealName || '-' },
            { label: 'Instalacion', value: client.installationName || '-' },
            { label: 'Vigencia', value: validStr || 'Sin definir' },
          ]}
        />

        <View style={ls.body}>
          {sec.showCompanyIntro && aiDescription && (
            <Text style={ls.description}>{aiDescription}</Text>
          )}

          {sec.showPositionsTable && (
            <>
              <SectionTitle numbered={numbered} num={nextNum()}>
                {`Puestos de trabajo · ${totalGuards} guardia(s)`}
              </SectionTitle>

              <PDFTable
                headers={positionHeaders}
                rows={positionRows}
                subtotalRow={
                  hasAdditional
                    ? { label: 'Subtotal guardias', value: totals.subtotalGuards }
                    : undefined
                }
              />
            </>
          )}

          {/* Standard additional services table */}
          {showSimpleAdditional && (
            <>
              <SectionTitle numbered={numbered} num={nextNum()}>
                Servicios y Productos Adicionales
              </SectionTitle>
              <PDFTable
                headers={additionalHeaders}
                rows={additionalRows}
                subtotalRow={{
                  label: 'Subtotal adicionales',
                  value: totals.subtotalAdditional,
                }}
              />
            </>
          )}

          {/* Detailed additional services table (with tipo/recurrencia) */}
          {showDetailedAdditional && (
            <AdditionalServicesDetailed
              lines={additionalLines}
              numbered={numbered}
              sectionNum={nextNum()}
            />
          )}

          <PDFGrandTotal
            label="PRECIO VENTA MENSUAL NETO"
            amount={totals.totalNet}
          />
          <Text style={ls.netNote}>
            Valores netos. IVA se factura segun ley vigente.
          </Text>
        </View>

        <PDFFooter website={companyConfig.website} date={dateStr} pageLabel={`${++currentPage}/${pageCount}`} />
      </Page>

      {/* ─── PAGE 2: Condiciones + Labor Detail + Cost Breakdown + Compliance ─── */}
      {(sec.showConditions || sec.showIncludedItems || sec.showSignature ||
        (sec.showLaborDetail && laborBreakdown) ||
        (sec.showCostBreakdown && costsByCategory.length > 0) ||
        (sec.showComplianceSection && complianceItems)) && (
        <Page size="A4" style={ls.page}>
          <PDFHeader
            brandName={brandName}
            code={quote.code}
          />
          <PDFAccentLine />

          <View style={ls.body}>
            {/* Labor detail (Detailed / Tender) */}
            {sec.showLaborDetail && laborBreakdown && (
              <LaborDetailSection
                laborBreakdown={laborBreakdown}
                numbered={numbered}
                sectionNum={nextNum()}
              />
            )}

            {/* Cost breakdown by category (Detailed / Tender) */}
            {sec.showCostBreakdown && costsByCategory.length > 0 && (
              <CostBreakdownByCategory
                costsByCategory={costsByCategory}
                fmtFn={fmtCat}
                numbered={numbered}
                sectionNum={nextNum()}
              />
            )}

            {/* Compliance (Tender only) */}
            {sec.showComplianceSection && complianceItems && complianceItems.length > 0 && (
              <ComplianceSection
                items={complianceItems}
                numbered={numbered}
                sectionNum={nextNum()}
              />
            )}

            {sec.showConditions && (
              <>
                <SectionTitle numbered={numbered} num={nextNum()}>Condiciones Comerciales</SectionTitle>

                <View style={ls.conditionsGrid}>
                  <View style={ls.conditionCardWrapper}>
                    <PDFConditionCard
                      label="Vigencia de la propuesta"
                      value={validStr || 'Sin definir'}
                    />
                  </View>
                  <View style={ls.conditionCardWrapper}>
                    <PDFConditionCard label="Forma de pago" value={paymentLabel} />
                  </View>
                  <View style={ls.conditionCardWrapper}>
                    <PDFConditionCard
                      label="Inicio del servicio"
                      value={`${conditions.serviceStartDays} dias habiles desde aprobacion`}
                    />
                  </View>
                  <View style={ls.conditionCardWrapper}>
                    <PDFConditionCard
                      label="Duracion del contrato"
                      value={`${conditions.contractDuration} meses`}
                    />
                  </View>
                </View>
              </>
            )}

            {sec.showIncludedItems && (
              <>
                <SectionTitle numbered={numbered} num={nextNum()}>El servicio incluye</SectionTitle>
                <View style={{ marginBottom: 8 }}>
                  {displayItems.map((item, i) => (
                    <View key={i} style={ls.bulletItem}>
                      <Text style={ls.bulletDot}>●</Text>
                      <Text style={ls.bulletText}>{item}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {serviceDetail && (
              <>
                <SectionTitle numbered={numbered} num={nextNum()}>Detalle del servicio</SectionTitle>
                <Text style={ls.serviceDetail}>{serviceDetail}</Text>
              </>
            )}

            {sec.showSignature && (
              <PDFSignatureArea
                companyName={companyConfig.companyName}
                clientName={client.name}
                repLegal={companyConfig.repLegalNombre}
              />
            )}

            <PDFContactBanner
              email={companyConfig.email}
              phone={companyConfig.phone}
              website={companyConfig.website}
            />
          </View>

          <PDFFooter
            website={companyConfig.website}
            date={dateStr}
            pageLabel={`${++currentPage}/${pageCount}`}
          />
        </Page>
      )}

      {/* ─── PAGE 3: Estructura de Costos (breakdown) ─── */}
      {breakdown && sec.showCostSummaryByCategory && (
        <BreakdownPage
          breakdown={breakdown}
          companyConfig={companyConfig}
          quoteCode={quote.code}
          dateStr={dateStr}
          pageLabel={`${++currentPage}/${pageCount}`}
        />
      )}
    </Document>
  );
}
