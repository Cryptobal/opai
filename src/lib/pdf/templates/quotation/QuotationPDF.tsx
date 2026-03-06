/**
 * QuotationPDF — 2-page CPQ quotation document
 *
 * Page 1: Propuesta económica (positions table + total)
 * Page 2: Condiciones comerciales + firma
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

/* ─── Props ─── */

export interface QuotationPDFProps {
  quote: {
    code: string;
    name?: string;
    validUntil?: string;
    currency: 'CLP' | 'UF';
    createdAt: string;
  };
  client: {
    name: string;
    accountName?: string;
    dealName?: string;
    installationName?: string;
  };
  positions: Array<{
    name: string;
    guards: number;
    quantity: number;
    days: string;
    schedule: string;
    monthlyValue: string;
  }>;
  additionalServices: Array<{
    product: string;
    description: string;
    monthlyValue: string;
  }>;
  totals: {
    subtotalGuards: string;
    subtotalAdditional: string;
    totalNet: string;
  };
  conditions: {
    paymentTerms: string;
    serviceStartDays: number;
    contractDuration: number;
  };
  companyConfig: {
    commercialName: string;
    companyName: string;
    email: string;
    phone: string;
    website: string;
    repLegalNombre?: string;
  };
  includedItems: string[];
  aiDescription?: string;
  serviceDetail?: string;
}

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
    fontSize: 9,
    color: pdfColors.slate600,
    padding: 10,
    backgroundColor: pdfColors.slate50,
    borderRadius: 3,
    marginTop: 10,
    lineHeight: 1.5,
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
});

/* ─── Payment terms label ─── */
const PAYMENT_LABELS: Record<string, string> = {
  contrafactura: 'Contra factura',
  '30dias': '30 días',
  anticipado: 'Pago anticipado',
};

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
  } = props;

  const dateStr = new Date().toLocaleDateString('es-CL');
  const createdStr = quote.createdAt
    ? new Date(quote.createdAt).toLocaleDateString('es-CL')
    : dateStr;
  const validStr = quote.validUntil
    ? new Date(quote.validUntil).toLocaleDateString('es-CL')
    : '';

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
  const totalGuards = positions.reduce(
    (s, p) => s + p.guards * p.quantity,
    0,
  );

  const paymentLabel =
    PAYMENT_LABELS[conditions.paymentTerms] || conditions.paymentTerms;

  // Default included items if none provided
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

  return (
    <Document>
      {/* ─── PAGE 1: Propuesta Economica ─── */}
      <Page size="A4" style={ls.page}>
        <PDFHeader
          brandName={companyConfig.commercialName?.toUpperCase() || 'GARD SECURITY'}
          subtitle="Servicios de seguridad integral"
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
          {aiDescription && <Text style={ls.description}>{aiDescription}</Text>}

          <PDFSectionTitle>
            {`Puestos de trabajo · ${totalGuards} guardia(s)`}
          </PDFSectionTitle>

          <PDFTable
            headers={positionHeaders}
            rows={positionRows}
            subtotalRow={
              hasAdditional
                ? { label: 'Subtotal guardias', value: totals.subtotalGuards }
                : undefined
            }
          />

          {hasAdditional && (
            <>
              <PDFSectionTitle>Servicios y Productos Adicionales</PDFSectionTitle>
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

          <PDFGrandTotal
            label="PRECIO VENTA MENSUAL NETO"
            amount={totals.totalNet}
          />
          <Text style={ls.netNote}>
            Valores netos. IVA se factura segun ley vigente.
          </Text>
        </View>

        <PDFFooter website={companyConfig.website} date={dateStr} pageLabel="1/2" />
      </Page>

      {/* ─── PAGE 2: Condiciones Comerciales ─── */}
      <Page size="A4" style={ls.page}>
        <PDFHeader
          brandName={companyConfig.commercialName?.toUpperCase() || 'GARD SECURITY'}
          code={quote.code}
        />
        <PDFAccentLine />

        <View style={ls.body}>
          <PDFSectionTitle>Condiciones Comerciales</PDFSectionTitle>

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

          <PDFSectionTitle>El servicio incluye</PDFSectionTitle>
          <View style={{ marginBottom: 8 }}>
            {displayItems.map((item, i) => (
              <View key={i} style={ls.bulletItem}>
                <Text style={ls.bulletDot}>●</Text>
                <Text style={ls.bulletText}>{item}</Text>
              </View>
            ))}
          </View>

          {serviceDetail && (
            <>
              <PDFSectionTitle>Detalle del servicio</PDFSectionTitle>
              <Text style={ls.serviceDetail}>{serviceDetail}</Text>
            </>
          )}

          <PDFSignatureArea
            companyName={companyConfig.companyName}
            clientName={client.name}
            repLegal={companyConfig.repLegalNombre}
          />

          <PDFContactBanner
            email={companyConfig.email}
            phone={companyConfig.phone}
            website={companyConfig.website}
          />
        </View>

        <PDFFooter
          website={companyConfig.website}
          date={dateStr}
          pageLabel="2/2"
        />
      </Page>
    </Document>
  );
}
