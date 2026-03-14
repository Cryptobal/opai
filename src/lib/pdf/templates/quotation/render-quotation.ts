/**
 * Render QuotationPDF to buffer using React.createElement directly.
 *
 * IMPORTANT: This file MUST stay as plain .ts (no JSX).
 * It uses eval('require') + React.createElement to bypass two critical issues:
 * 1. Next.js SWC compiles JSX with its bundled React, creating elements
 *    incompatible with @react-pdf/renderer's bundled react-reconciler.
 * 2. eval('require') bypasses webpack's module resolution so both React
 *    and @react-pdf load from the same node_modules (no instance mismatch).
 *
 * DO NOT convert this to JSX or use import/await import for react/@react-pdf.
 */

import type { QuoteBreakdownData } from '@/types/cpq-breakdown';
import type { ProposalTemplateSections, CostByCategory } from '@/types/cpq';

export interface AdditionalLinePDF {
  nombre: string;
  descripcion?: string;
  tipo: string;
  recurrencia: string;
  precioMensual: number;
  marginPct: number;
  precioVenta: number;
  precioVentaFmt: string;
}

export interface LaborPositionDetailPDF {
  name: string;
  totalGuardsInPosition: number;
  baseSalary: number;
  gratification: number;
  totalImponible: number;
  sisEmployer: number;
  afcEmployer: number;
  mutualEmployer: number;
  vacationProvision: number;
  severanceProvision: number;
  totalLaborCost: number;
}

export interface LaborBreakdownPDF {
  sueldoBrutoPromedio: number;
  cargasSocialesPct: number;
  gratificacion: number;
  totalPorGuardia: number;
  totalGuardias: number;
  totalMensual: number;
  /** Per-position detailed breakdown (Fix 5) */
  positionDetails: LaborPositionDetailPDF[];
}

export const DEFAULT_TEMPLATE_SECTIONS: ProposalTemplateSections = {
  showCoverPage: true,
  showCompanyIntro: true,
  showPositionsTable: true,
  showCostBreakdown: false,
  showCostSummaryByCategory: false,
  showLaborDetail: false,
  showEquipmentDetail: false,
  showVehicleDetail: false,
  showAdditionalServices: true,
  showConditions: true,
  showIncludedItems: true,
  showSignature: true,
  showComplianceSection: false,
  numberedSections: false,
  headerStyle: 'standard',
};

export const DEFAULT_COMPLIANCE_ITEMS = [
  'Ley 21.659 de Seguridad Privada',
  'Acreditación OS-10 Carabineros de Chile',
  'DS N° 44 (2025) Marco preventivo de seguridad',
  'Ley 16.744 Accidentes del trabajo y enfermedades profesionales',
  'DS N° 594 Condiciones sanitarias y ambientales básicas en los lugares de trabajo',
  'Código del Trabajo Art. 184 — Obligación de protección al trabajador',
];

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
    brandNameUpper?: string;
    logoUrl?: string;
  };
  includedItems: string[];
  aiDescription?: string;
  serviceDetail?: string;
  breakdown?: QuoteBreakdownData;

  templateSections: ProposalTemplateSections;
  costsByCategory: CostByCategory[];
  additionalLines: AdditionalLinePDF[];
  laborBreakdown?: LaborBreakdownPDF;
  complianceItems?: string[];
}

export async function renderQuotationToBuffer(
  props: QuotationPDFProps,
): Promise<Buffer> {
  // eslint-disable-next-line no-eval
  const nodeRequire = eval('require') as NodeRequire;
  const React = nodeRequire('react');
  // @react-pdf/renderer is ESM-only; require() fails in production. Use dynamic import.
  const pdf = await import('@react-pdf/renderer');

  const {
    renderToBuffer,
    Document,
    Page,
    View,
    Text,
    StyleSheet,
    Svg,
    Path,
    Image: PDFImage,
  } = pdf;

  // Font registration — inline it since eval'd require can't resolve @/ aliases
  // or relative paths reliably in webpack output
  const path = nodeRequire('path');
  const { Font } = pdf;
  const fontsDir = path.join(process.cwd(), 'public', 'fonts');
  const registered = (globalThis as Record<string, unknown>).__pdfFontsRegistered;
  if (!registered) {
    Font.register({
      family: 'PlusJakartaSans',
      fonts: [
        { src: path.join(fontsDir, 'PlusJakartaSans-Regular.ttf'), fontWeight: 400 },
        { src: path.join(fontsDir, 'PlusJakartaSans-Medium.ttf'), fontWeight: 500 },
        { src: path.join(fontsDir, 'PlusJakartaSans-SemiBold.ttf'), fontWeight: 600 },
        { src: path.join(fontsDir, 'PlusJakartaSans-Bold.ttf'), fontWeight: 700 },
        { src: path.join(fontsDir, 'PlusJakartaSans-ExtraBold.ttf'), fontWeight: 800 },
      ],
    });
    Font.register({
      family: 'JetBrainsMono',
      fonts: [
        { src: path.join(fontsDir, 'JetBrainsMono-Regular.ttf'), fontWeight: 400 },
        { src: path.join(fontsDir, 'JetBrainsMono-Medium.ttf'), fontWeight: 500 },
      ],
    });
    (globalThis as Record<string, unknown>).__pdfFontsRegistered = true;
  }

  const e = React.createElement;

  /* ─── Theme ─── */
  const C = {
    navy: '#0f172a',
    navyLight: '#1e293b',
    teal: '#14b8a6',
    tealLight: '#ccfbf1',
    slate50: '#f8fafc',
    slate100: '#f1f5f9',
    slate200: '#e2e8f0',
    slate400: '#94a3b8',
    slate500: '#64748b',
    slate600: '#475569',
    slate700: '#334155',
    white: '#ffffff',
  };
  const F = { sans: 'PlusJakartaSans', mono: 'JetBrainsMono' };

  const s = StyleSheet.create({
    page: {
      fontFamily: F.sans,
      fontSize: 9,
      color: C.slate700,
      backgroundColor: C.white,
      paddingBottom: 50,
    },
    headerBand: {
      backgroundColor: C.navy,
      padding: 30,
      paddingBottom: 20,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    brandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    brandName: {
      fontFamily: F.sans,
      fontWeight: 800,
      fontSize: 20,
      color: C.white,
      letterSpacing: 2,
    },
    brandSub: {
      fontFamily: F.sans,
      fontSize: 8,
      color: C.slate400,
      marginTop: 2,
    },
    headerLabel: {
      fontFamily: F.sans,
      fontSize: 8,
      color: C.slate400,
      marginBottom: 2,
    },
    headerCode: {
      fontFamily: F.mono,
      fontSize: 11,
      color: C.teal,
      fontWeight: 500,
    },
    accentLine: { height: 3, backgroundColor: C.teal },
    infoStrip: {
      flexDirection: 'row',
      backgroundColor: C.slate50,
      borderBottom: `1 solid ${C.slate200}`,
    },
    infoCell: {
      flex: 1,
      padding: 10,
      borderRight: `1 solid ${C.slate200}`,
    },
    infoCellLast: { flex: 1, padding: 10 },
    infoLabel: {
      fontFamily: F.sans,
      fontSize: 7,
      color: C.slate500,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 2,
    },
    infoValue: {
      fontFamily: F.sans,
      fontSize: 9,
      fontWeight: 600,
      color: C.navy,
    },
    body: { paddingHorizontal: 30 },
    sectionTitle: {
      fontFamily: F.sans,
      fontSize: 11,
      fontWeight: 700,
      color: C.navy,
      paddingBottom: 6,
      borderBottom: `1 solid ${C.slate200}`,
      marginBottom: 8,
      marginTop: 16,
    },
    description: {
      fontFamily: F.sans,
      fontSize: 10,
      color: C.slate700,
      padding: 12,
      paddingLeft: 14,
      backgroundColor: C.slate50,
      borderRadius: 4,
      marginTop: 10,
      marginBottom: 4,
      lineHeight: 1.6,
      borderLeftWidth: 3,
      borderLeftColor: C.teal,
    },
    tblHeader: {
      flexDirection: 'row',
      backgroundColor: C.slate100,
      borderBottom: `1.5 solid ${C.teal}`,
      paddingVertical: 6,
      paddingHorizontal: 8,
    },
    tblHeaderCell: {
      fontFamily: F.sans,
      fontSize: 7,
      fontWeight: 700,
      color: C.navyLight,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    tblRow: {
      flexDirection: 'row',
      paddingVertical: 5,
      paddingHorizontal: 8,
      borderBottom: `0.5 solid ${C.slate200}`,
    },
    tblCell: { fontFamily: F.sans, fontSize: 9, color: C.slate700 },
    tblCellBold: {
      fontFamily: F.sans,
      fontSize: 9,
      fontWeight: 600,
      color: C.navy,
    },
    grandTotal: {
      flexDirection: 'row',
      backgroundColor: C.navy,
      paddingVertical: 10,
      paddingHorizontal: 12,
      marginTop: 4,
      borderRadius: 4,
    },
    grandTotalLabel: {
      fontFamily: F.sans,
      fontSize: 11,
      fontWeight: 700,
      color: C.white,
      flex: 1,
    },
    grandTotalAmount: {
      fontFamily: F.mono,
      fontSize: 13,
      fontWeight: 700,
      color: C.teal,
    },
    netNote: {
      fontFamily: F.sans,
      fontSize: 7,
      color: C.slate400,
      marginTop: 4,
      textAlign: 'right',
    },
    condCard: {
      backgroundColor: C.white,
      borderLeft: `3 solid ${C.teal}`,
      padding: 10,
      marginBottom: 8,
      borderRadius: 2,
    },
    condLabel: {
      fontFamily: F.sans,
      fontSize: 7,
      color: C.slate500,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 3,
    },
    condValue: {
      fontFamily: F.sans,
      fontSize: 10,
      fontWeight: 600,
      color: C.navy,
    },
    bulletItem: { flexDirection: 'row', marginBottom: 5, paddingLeft: 4 },
    bulletDot: {
      fontFamily: F.sans,
      fontSize: 9,
      color: C.teal,
      fontWeight: 700,
      marginRight: 6,
      width: 8,
    },
    bulletText: {
      fontFamily: F.sans,
      fontSize: 9,
      color: C.slate700,
      flex: 1,
    },
    serviceDetail: {
      fontFamily: F.sans,
      fontSize: 9,
      color: C.slate700,
      lineHeight: 1.5,
      marginTop: 6,
    },
    sigArea: { flexDirection: 'row', marginTop: 24, gap: 40 },
    sigBlock: { flex: 1, alignItems: 'center' },
    sigLine: {
      width: '80%',
      borderBottom: `1 solid ${C.slate700}`,
      marginBottom: 6,
      marginTop: 40,
    },
    sigName: {
      fontFamily: F.sans,
      fontSize: 9,
      fontWeight: 600,
      color: C.navy,
    },
    sigRole: {
      fontFamily: F.sans,
      fontSize: 7,
      color: C.slate500,
      marginTop: 2,
    },
    contactBanner: {
      backgroundColor: C.teal,
      padding: 14,
      borderRadius: 4,
      marginTop: 16,
      flexDirection: 'row',
      justifyContent: 'space-around',
      alignItems: 'center',
    },
    contactLabel: {
      fontFamily: F.sans,
      fontSize: 7,
      color: C.tealLight,
      marginBottom: 2,
    },
    contactValue: {
      fontFamily: F.sans,
      fontSize: 9,
      fontWeight: 600,
      color: C.white,
    },
    footer: {
      position: 'absolute',
      bottom: 20,
      left: 30,
      right: 30,
      flexDirection: 'row',
      justifyContent: 'space-between',
      borderTop: `0.5 solid ${C.slate200}`,
      paddingTop: 8,
    },
    footerText: { fontFamily: F.sans, fontSize: 7, color: C.slate400 },
  });

  /* ─── Helpers ─── */
  const PAYMENT_LABELS: Record<string, string> = {
    contrafactura: 'Contra factura',
    '30dias': '30 dias',
    anticipado: 'Pago anticipado',
  };

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
  // Fix 2: validUntil always has a value (default: createdAt + 60 days)
  const validDate = quote.validUntil ? new Date(quote.validUntil) : (() => {
    const d = new Date(quote.createdAt); d.setDate(d.getDate() + 60); return d;
  })();
  const vdd = String(validDate.getDate()).padStart(2, '0');
  const vmm = String(validDate.getMonth() + 1).padStart(2, '0');
  const vyyyy = validDate.getFullYear();
  const validStr = `${vdd}-${vmm}-${vyyyy}`;
  const totalGuards = positions.reduce(
    (sum, p) => sum + p.guards * p.quantity,
    0,
  );
  const paymentLabel =
    PAYMENT_LABELS[conditions.paymentTerms] || conditions.paymentTerms;
  const hasAdditional = additionalServices.length > 0;
  const hasDetailedAdditional = (additionalLines?.length ?? 0) > 0;
  // Fix 1: Strip trailing SECURITY/SEGURIDAD from brand name
  const rawBrandName =
    companyConfig.brandNameUpper ?? companyConfig.commercialName?.toUpperCase() ?? 'EMPRESA';
  const brandName = rawBrandName.replace(/\s+(SECURITY|SEGURIDAD|SEG)\b/i, '').trim();

  const numbered = sec.numberedSections;
  let sectionCounter = 0;
  const nextNum = () => ++sectionCounter;

  const showDetailedAdditional = sec.showAdditionalServices && hasDetailedAdditional &&
    (sec.showCostBreakdown || sec.showLaborDetail);
  const showSimpleAdditional = sec.showAdditionalServices && hasAdditional && !showDetailedAdditional;

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

  /* ─── Reusable sub-trees ─── */

  const shieldSvg = e(
    Svg,
    { width: 28, height: 28, viewBox: '0 0 24 24' },
    e(Path, {
      d: 'M12 2L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z',
      fill: C.teal,
    }),
    e(Path, {
      d: 'M10 15.5l-3.5-3.5 1.41-1.41L10 12.67l5.59-5.59L17 8.5l-7 7z',
      fill: C.white,
    }),
  );

  const logoElement = companyConfig.logoUrl
    ? e(PDFImage, { src: companyConfig.logoUrl, style: { height: 28, maxWidth: 120, objectFit: 'contain' as const } })
    : shieldSvg;

  const sectionTitle = (text: string, num?: number) =>
    numbered && num != null
      ? e(Text, { style: s.sectionTitle }, `${num}. ${text}`)
      : e(Text, { style: s.sectionTitle }, text);

  const header = (subtitle?: string) =>
    e(
      View,
      null,
      e(
        View,
        { style: s.headerBand },
        e(
          View,
          null,
          e(View, { style: s.brandRow }, logoElement, e(Text, { style: s.brandName }, brandName)),
          subtitle
            ? e(Text, { style: s.brandSub }, subtitle)
            : null,
        ),
        e(
          View,
          { style: { alignItems: 'flex-end' as const } },
          e(Text, { style: s.headerLabel }, 'COTIZACION'),
          e(Text, { style: s.headerCode }, quote.code),
        ),
      ),
      e(View, { style: s.accentLine }),
    );

  const infoStrip = e(
    View,
    { style: s.infoStrip },
    ...[
      { label: 'CLIENTE', value: client.name },
      { label: 'NEGOCIO', value: client.dealName || '-' },
      { label: 'INSTALACION', value: client.installationName || '-' },
      { label: 'VIGENCIA', value: validStr },
    ].map((item, i, arr) =>
      e(
        View,
        { key: i, style: i < arr.length - 1 ? s.infoCell : s.infoCellLast },
        e(Text, { style: s.infoLabel }, item.label),
        e(Text, { style: s.infoValue }, item.value),
      ),
    ),
  );

  /* ─── Position table ─── */
  const posHeaders = [
    { label: 'Puesto', flex: 2.5, align: 'left' as const },
    { label: 'G', flex: 0.5, align: 'center' as const },
    { label: 'Cant', flex: 0.5, align: 'center' as const },
    { label: 'Dias', flex: 1.5, align: 'left' as const },
    { label: 'Horario', flex: 1.2, align: 'left' as const },
    { label: 'Valor Mensual', flex: 1.3, align: 'right' as const },
  ];

  const posTableHeader = e(
    View,
    { style: s.tblHeader },
    ...posHeaders.map((h, i) =>
      e(
        Text,
        { key: i, style: [s.tblHeaderCell, { flex: h.flex, textAlign: h.align }] },
        h.label,
      ),
    ),
  );

  const posRows = positions.map((p, i) =>
    e(
      View,
      { key: i, style: s.tblRow },
      e(Text, { style: [s.tblCell, { flex: 2.5 }] }, p.name),
      e(Text, { style: [s.tblCell, { flex: 0.5, textAlign: 'center' as const }] }, String(p.guards)),
      e(Text, { style: [s.tblCell, { flex: 0.5, textAlign: 'center' as const }] }, String(p.quantity)),
      e(Text, { style: [s.tblCell, { flex: 1.5 }] }, p.days),
      e(Text, { style: [s.tblCell, { flex: 1.2 }] }, p.schedule),
      e(Text, { style: [s.tblCellBold, { flex: 1.3, textAlign: 'right' as const }] }, p.monthlyValue),
    ),
  );

  const posSubtotal = hasAdditional
    ? e(
        View,
        { style: [s.tblRow, { backgroundColor: C.slate50 }] },
        e(
          Text,
          { style: [s.tblCellBold, { flex: 5.2, textAlign: 'right' as const, paddingRight: 8 }] },
          'Subtotal guardias',
        ),
        e(
          Text,
          { style: [s.tblCellBold, { flex: 1.3, textAlign: 'right' as const }] },
          totals.subtotalGuards,
        ),
      )
    : null;

  /* ─── Simple additional services table (standard template) ─── */
  const addHeaders = [
    { label: 'Producto / Servicio', flex: 2, align: 'left' as const },
    { label: 'Descripcion', flex: 3, align: 'left' as const },
    { label: 'Valor Mensual', flex: 1.5, align: 'right' as const },
  ];

  const buildSimpleAddTable = (num: number) =>
    e(
      View,
      null,
      sectionTitle('Servicios y Productos Adicionales', num),
      e(
        View,
        { style: s.tblHeader },
        ...addHeaders.map((h, i) =>
          e(
            Text,
            { key: i, style: [s.tblHeaderCell, { flex: h.flex, textAlign: h.align }] },
            h.label,
          ),
        ),
      ),
      ...additionalServices.map((svc, i) =>
        e(
          View,
          { key: i, style: s.tblRow },
          e(Text, { style: [s.tblCell, { flex: 2 }] }, svc.product),
          e(Text, { style: [s.tblCell, { flex: 3 }] }, svc.description),
          e(Text, { style: [s.tblCellBold, { flex: 1.5, textAlign: 'right' as const }] }, svc.monthlyValue),
        ),
      ),
      e(
        View,
        { style: [s.tblRow, { backgroundColor: C.slate50 }] },
        e(Text, { style: [s.tblCellBold, { flex: 5, textAlign: 'right' as const, paddingRight: 8 }] }, 'Subtotal adicionales'),
        e(Text, { style: [s.tblCellBold, { flex: 1.5, textAlign: 'right' as const }] }, totals.subtotalAdditional),
      ),
    );

  /* ─── Detailed additional services table (detailed/tender) ─── */
  const detailedAddHeaders = [
    { label: 'Producto / Servicio', flex: 2, align: 'left' as const },
    { label: 'Tipo', flex: 1, align: 'center' as const },
    { label: 'Recurrencia', flex: 1, align: 'center' as const },
    { label: 'Valor Mensual', flex: 1.5, align: 'right' as const },
  ];

  const buildDetailedAddTable = (num: number) =>
    e(
      View,
      null,
      sectionTitle('Servicios y Productos Adicionales', num),
      e(
        View,
        { style: s.tblHeader },
        ...detailedAddHeaders.map((h, i) =>
          e(Text, { key: i, style: [s.tblHeaderCell, { flex: h.flex, textAlign: h.align }] }, h.label),
        ),
      ),
      ...additionalLines.map((line, i) =>
        e(
          View,
          { key: i, style: s.tblRow },
          e(Text, { style: [s.tblCell, { flex: 2 }] }, line.nombre),
          e(Text, { style: [s.tblCell, { flex: 1, textAlign: 'center' as const }] }, line.tipo),
          e(Text, { style: [s.tblCell, { flex: 1, textAlign: 'center' as const }] }, line.recurrencia === 'unico' ? 'Unico (prorrateado)' : line.recurrencia),
          e(Text, { style: [s.tblCellBold, { flex: 1.5, textAlign: 'right' as const }] }, line.precioVentaFmt),
        ),
      ),
    );

  /* ─── Currency format helper ─── */
  const fmtMoney = (n: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Math.round(n));

  /* ─── Footer with dynamic page numbers via render prop ─── */
  const pageFooter = () =>
    e(
      View,
      { style: s.footer, fixed: true },
      e(Text, { style: s.footerText }, `Confidencial \u00B7 ${dateStr}`),
      e(Text, { style: s.footerText }, companyConfig.website || ''),
      e(Text, {
        style: s.footerText,
        render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
          `${pageNumber}/${totalPages}`,
      }),
    );

  /* ─── Conditions cards ─── */
  const condCard = (label: string, value: string) =>
    e(
      View,
      { style: { width: '48%' } },
      e(
        View,
        { style: s.condCard },
        e(Text, { style: s.condLabel }, label),
        e(Text, { style: s.condValue }, value),
      ),
    );

  /* ─── Labor detail sub-tree (deferred numbering) ─── */
  const laborRow = (label: string, value: string) =>
    e(
      View,
      { style: [s.tblRow, { paddingLeft: 10 }] },
      e(Text, { style: [s.tblCell, { flex: 3 }] }, label),
      e(Text, { style: [s.tblCellBold, { flex: 2, textAlign: 'right' as const }] }, value),
    );

  const hasLaborDetail = !!(sec.showLaborDetail && laborBreakdown);
  const buildLaborDetail = (num: number) => {
    if (!laborBreakdown) return null;
    const hasDetails = laborBreakdown.positionDetails && laborBreakdown.positionDetails.length > 0;
    const perGuardDivisor = (guards: number) => Math.max(1, guards);

    const positionCards = hasDetails
      ? laborBreakdown.positionDetails.map((pos, idx) => {
          const div = perGuardDivisor(pos.totalGuardsInPosition);
          const totalSocial = pos.sisEmployer + pos.afcEmployer + pos.mutualEmployer;
          const perGuardCost = pos.totalLaborCost / div;
          return e(
            View,
            { key: idx, style: { marginBottom: 8, borderWidth: 0.5, borderColor: C.slate200, borderRadius: 4, overflow: 'hidden' as const } },
            e(View, { style: { backgroundColor: C.slate50, paddingVertical: 4, paddingHorizontal: 10, borderBottomWidth: 0.5, borderBottomColor: C.slate200 } },
              e(Text, { style: [s.tblCellBold, { fontSize: 9 }] }, `${pos.name} \u00B7 ${pos.totalGuardsInPosition} guardia${pos.totalGuardsInPosition !== 1 ? 's' : ''}`),
            ),
            laborRow('Sueldo base imponible', fmtMoney(pos.baseSalary / div)),
            laborRow('Gratificacion legal', fmtMoney(pos.gratification / div)),
            laborRow('Total haberes imponibles', fmtMoney(pos.totalImponible / div)),
            laborRow('SIS (Seguro invalidez y sobrevivencia)', fmtMoney(pos.sisEmployer / div)),
            laborRow('AFC (Seguro cesantia empleador)', fmtMoney(pos.afcEmployer / div)),
            laborRow('Mutual / Accidentes (Ley 16.744)', fmtMoney(pos.mutualEmployer / div)),
            laborRow('Total cargas sociales empleador', fmtMoney(totalSocial / div)),
            pos.vacationProvision > 0 ? laborRow('Provision vacaciones', fmtMoney(pos.vacationProvision / div)) : null,
            pos.severanceProvision > 0 ? laborRow('Provision indemnizacion', fmtMoney(pos.severanceProvision / div)) : null,
            e(
              View,
              { style: [s.tblRow, { paddingLeft: 10, backgroundColor: C.slate50 }] },
              e(Text, { style: [s.tblCellBold, { flex: 3 }] }, 'Costo empresa por guardia'),
              e(Text, { style: [s.tblCellBold, { flex: 2, textAlign: 'right' as const }] }, fmtMoney(perGuardCost)),
            ),
          );
        })
      : [];

    return e(
      View,
      null,
      sectionTitle('Detalle de Mano de Obra', num),
      ...positionCards,
      e(
        View,
        { style: { marginBottom: 8, backgroundColor: C.slate50, borderRadius: 4, padding: 8 } },
        laborRow('Total guardias', String(laborBreakdown.totalGuardias)),
        e(
          View,
          { style: [s.tblRow, { paddingLeft: 10, borderBottomWidth: 0 }] },
          e(Text, { style: [s.tblCellBold, { flex: 3 }] }, 'Total mensual mano de obra'),
          e(Text, { style: [s.tblCellBold, { flex: 2, textAlign: 'right' as const }] }, fmtMoney(laborBreakdown.totalMensual)),
        ),
      ),
    );
  };

  /* ─── Cost breakdown by category sub-tree (deferred numbering) ─── */
  const hasCostBreakdown = !!(sec.showCostBreakdown && costsByCategory && costsByCategory.length > 0);
  const buildCostBreakdown = (num: number) =>
    costsByCategory && costsByCategory.length > 0
      ? e(
          View,
          null,
          sectionTitle('Desglose de Costos por Categoria', num),
          ...costsByCategory.map((cat, catIdx) =>
            e(
              View,
              { key: catIdx, style: { marginBottom: 6 } },
              e(
                View,
                { style: [s.tblRow, { backgroundColor: cat.categoryType === 'indirect' ? '#fef3c7' : C.tealLight }] },
                e(Text, { style: [s.tblCellBold, { flex: 3, color: cat.categoryType === 'indirect' ? '#b45309' : '#0d9488' }] }, cat.category),
                e(Text, { style: [s.tblCellBold, { flex: 2, textAlign: 'right' as const, color: cat.categoryType === 'indirect' ? '#b45309' : '#0d9488' }] }, fmtMoney(cat.subtotal)),
              ),
              ...cat.items.map((item, itemIdx) =>
                e(
                  View,
                  { key: itemIdx, style: [s.tblRow, { paddingLeft: 14 }] },
                  e(Text, { style: [s.tblCell, { flex: 3, fontSize: 7.5, color: C.slate400 }] }, item.name),
                  e(Text, { style: [s.tblCell, { flex: 2, textAlign: 'right' as const, fontSize: 7.5, color: C.slate400 }] }, fmtMoney(item.amount)),
                ),
              ),
            ),
          ),
        )
      : null;

  /* ─── Compliance section sub-tree (deferred numbering) ─── */
  const hasCompliance = !!(sec.showComplianceSection && complianceItems && complianceItems.length > 0);
  const buildCompliance = (num: number) =>
    complianceItems && complianceItems.length > 0
      ? e(
          View,
          null,
          sectionTitle('Cumplimiento Normativo', num),
          e(
            View,
            { style: { marginBottom: 8 } },
            ...complianceItems.map((item, i) =>
              e(
                View,
                { key: i, style: s.bulletItem },
                e(Text, { style: [s.bulletDot, { color: '#0d9488' }] }, '\u2713'),
                e(Text, { style: s.bulletText }, item),
              ),
            ),
          ),
        )
      : null;

  /* ─── BUILD DOCUMENT ─── */
  const pages: unknown[] = [];

  // ─── PAGE 1: Propuesta Economica ───
  pages.push(
    e(
      Page,
      { key: 'p1', size: 'A4', style: s.page },
      header(sec.headerStyle === 'formal' ? `Cotizacion N\u00B0 ${quote.code}` : 'Servicios de seguridad integral'),
      infoStrip,
      e(
        View,
        { style: s.body },
        sec.showCompanyIntro && aiDescription ? e(Text, { style: s.description }, aiDescription) : null,
        sec.showPositionsTable
          ? e(
              View,
              null,
              sectionTitle(`Puestos de trabajo \u00B7 ${totalGuards} guardia(s)`, nextNum()),
              e(View, null, posTableHeader, ...posRows, posSubtotal),
            )
          : null,
        showSimpleAdditional ? buildSimpleAddTable(nextNum()) : null,
        showDetailedAdditional ? buildDetailedAddTable(nextNum()) : null,
        e(
          View,
          { style: s.grandTotal },
          e(Text, { style: s.grandTotalLabel }, 'PRECIO VENTA MENSUAL NETO'),
          e(Text, { style: s.grandTotalAmount }, totals.totalNet),
        ),
        e(Text, { style: s.netNote }, 'Valores netos. IVA se factura segun ley vigente.'),
      ),
      pageFooter(),
    ),
  );

  // ─── PAGE 2: Conditions + Labor Detail + Cost Breakdown + Compliance ───
  const hasPage2 = sec.showConditions || sec.showIncludedItems || sec.showSignature ||
    hasLaborDetail || hasCostBreakdown || hasCompliance;

  if (hasPage2) {
    pages.push(
      e(
        Page,
        { key: 'p2', size: 'A4', style: s.page },
        header(),
        e(
          View,
          { style: s.body },
          hasLaborDetail ? buildLaborDetail(nextNum()) : null,
          hasCostBreakdown ? buildCostBreakdown(nextNum()) : null,
          hasCompliance ? buildCompliance(nextNum()) : null,
          sec.showConditions
            ? e(
                View,
                null,
                sectionTitle('Condiciones Comerciales', nextNum()),
                e(
                  View,
                  { style: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8, marginTop: 8 } },
                  condCard('Vigencia de la propuesta', validStr),
                  condCard('Forma de pago', paymentLabel),
                  condCard('Inicio del servicio', `${conditions.serviceStartDays} dias habiles desde aprobacion`),
                  condCard('Duracion del contrato', `${conditions.contractDuration} meses`),
                ),
              )
            : null,
          sec.showIncludedItems
            ? e(
                View,
                null,
                sectionTitle('El servicio incluye', nextNum()),
                e(
                  View,
                  { style: { marginBottom: 8 } },
                  ...displayItems.map((item, i) =>
                    e(
                      View,
                      { key: i, style: s.bulletItem },
                      e(Text, { style: s.bulletDot }, '\u25CF'),
                      e(Text, { style: s.bulletText }, item),
                    ),
                  ),
                ),
              )
            : null,
          serviceDetail
            ? e(
                View,
                null,
                sectionTitle('Detalle del servicio', nextNum()),
                e(Text, { style: s.serviceDetail }, serviceDetail),
              )
            : null,
          // Fix 3: Signatures go on the LAST page — only render here if no breakdown page follows
          sec.showSignature && !(breakdown && sec.showCostSummaryByCategory)
            ? e(
                View,
                { wrap: false },
                e(
                  View,
                  { style: s.sigArea },
                  e(
                    View,
                    { style: s.sigBlock },
                    e(View, { style: s.sigLine }),
                    e(Text, { style: s.sigName }, companyConfig.companyName),
                    companyConfig.repLegalNombre
                      ? e(Text, { style: s.sigRole }, companyConfig.repLegalNombre)
                      : null,
                    e(Text, { style: s.sigRole }, 'Representante Legal'),
                  ),
                  e(
                    View,
                    { style: s.sigBlock },
                    e(View, { style: s.sigLine }),
                    e(Text, { style: s.sigName }, client.name),
                    e(Text, { style: s.sigRole }, 'Cliente'),
                  ),
                ),
                e(
                  View,
                  { style: s.contactBanner },
                  e(
                    View,
                    { style: { alignItems: 'center' as const } },
                    e(Text, { style: s.contactLabel }, 'EMAIL'),
                    e(Text, { style: s.contactValue }, companyConfig.email),
                  ),
                  e(
                    View,
                    { style: { alignItems: 'center' as const } },
                    e(Text, { style: s.contactLabel }, 'TELEFONO'),
                    e(Text, { style: s.contactValue }, companyConfig.phone),
                  ),
                  companyConfig.website
                    ? e(
                        View,
                        { style: { alignItems: 'center' as const } },
                        e(Text, { style: s.contactLabel }, 'WEB'),
                        e(Text, { style: s.contactValue }, companyConfig.website),
                      )
                    : null,
                ),
              )
            : null,
        ),
        pageFooter(),
      ),
    );
  }

  // ─── PAGE 3: Estructura de Costos (optional) ───
  if (breakdown && sec.showCostSummaryByCategory) {
    pages.push(
      e(
        Page,
        { key: 'p3', size: 'A4', style: s.page },
        header(),
        e(
          View,
          { style: s.body },
          e(Text, { style: s.sectionTitle }, 'Estructura de Costos'),

          // Fix 6: Per-position labor detail in breakdown
          e(
            View,
            { style: { marginBottom: 8 } },
            e(
              View,
              { style: [s.tblRow, { backgroundColor: '#dbeafe' }] },
              e(Text, { style: [s.tblCellBold, { flex: 3, color: '#1d4ed8' }] }, 'Mano de Obra'),
              e(Text, { style: [s.tblCellBold, { flex: 2, textAlign: 'right' as const, color: '#1d4ed8' }] }, fmtMoney(breakdown.totalLaborCost)),
            ),
            ...breakdown.positions.reduce<unknown[]>((acc, pos) => {
              acc.push(e(View, { key: `${pos.id}-hdr`, style: [s.tblRow, { paddingLeft: 12, backgroundColor: '#f0f9ff' }] }, e(Text, { style: [s.tblCellBold, { flex: 3, fontSize: 8 }] }, `${pos.name} (${pos.totalGuardsInPosition}g)`), e(Text, { style: [s.tblCellBold, { flex: 2, textAlign: 'right' as const, fontSize: 8 }] }, fmtMoney(pos.totalLaborCost))));
              acc.push(e(View, { key: `${pos.id}-base`, style: [s.tblRow, { paddingLeft: 16 }] }, e(Text, { style: [s.tblCell, { flex: 3 }] }, 'Sueldo base'), e(Text, { style: [s.tblCell, { flex: 2, textAlign: 'right' as const }] }, fmtMoney(pos.baseSalary))));
              if (pos.gratification > 0) acc.push(e(View, { key: `${pos.id}-grat`, style: [s.tblRow, { paddingLeft: 16 }] }, e(Text, { style: [s.tblCell, { flex: 3 }] }, 'Gratificacion legal'), e(Text, { style: [s.tblCell, { flex: 2, textAlign: 'right' as const }] }, fmtMoney(pos.gratification))));
              const socialCharges = pos.sisEmployer + pos.afcEmployer + pos.mutualEmployer;
              if (socialCharges > 0) acc.push(e(View, { key: `${pos.id}-social`, style: [s.tblRow, { paddingLeft: 16 }] }, e(Text, { style: [s.tblCell, { flex: 3 }] }, 'Cargas sociales (SIS+AFC+Mutual)'), e(Text, { style: [s.tblCell, { flex: 2, textAlign: 'right' as const }] }, fmtMoney(socialCharges))));
              const prov = pos.vacationProvision + pos.severanceProvision;
              if (prov > 0) acc.push(e(View, { key: `${pos.id}-prov`, style: [s.tblRow, { paddingLeft: 16 }] }, e(Text, { style: [s.tblCell, { flex: 3 }] }, 'Provisiones (vacac.+finiquito)'), e(Text, { style: [s.tblCell, { flex: 2, textAlign: 'right' as const }] }, fmtMoney(prov))));
              return acc;
            }, []),
          ),

          (breakdown.holidayAdjustment + breakdown.uniforms + breakdown.exams + breakdown.meals) > 0
            ? e(
                View,
                { style: { marginBottom: 8 } },
                e(View, { style: [s.tblRow, { backgroundColor: '#ccfbf1' }] }, e(Text, { style: [s.tblCellBold, { flex: 3, color: '#0d9488' }] }, 'Costos Directos'), e(Text, { style: [s.tblCellBold, { flex: 2, textAlign: 'right' as const, color: '#0d9488' }] }, fmtMoney(breakdown.holidayAdjustment + breakdown.uniforms + breakdown.exams + breakdown.meals))),
                breakdown.holidayAdjustment > 0 ? e(View, { style: [s.tblRow, { paddingLeft: 16 }] }, e(Text, { style: [s.tblCell, { flex: 3 }] }, 'Ajuste feriados legales'), e(Text, { style: [s.tblCell, { flex: 2, textAlign: 'right' as const }] }, fmtMoney(breakdown.holidayAdjustment))) : null,
                breakdown.uniforms > 0 ? e(View, { style: [s.tblRow, { paddingLeft: 16 }] }, e(Text, { style: [s.tblCell, { flex: 3 }] }, 'Uniformes'), e(Text, { style: [s.tblCell, { flex: 2, textAlign: 'right' as const }] }, fmtMoney(breakdown.uniforms))) : null,
                breakdown.exams > 0 ? e(View, { style: [s.tblRow, { paddingLeft: 16 }] }, e(Text, { style: [s.tblCell, { flex: 3 }] }, 'Examenes medicos'), e(Text, { style: [s.tblCell, { flex: 2, textAlign: 'right' as const }] }, fmtMoney(breakdown.exams))) : null,
                breakdown.meals > 0 ? e(View, { style: [s.tblRow, { paddingLeft: 16 }] }, e(Text, { style: [s.tblCell, { flex: 3 }] }, 'Alimentacion'), e(Text, { style: [s.tblCell, { flex: 2, textAlign: 'right' as const }] }, fmtMoney(breakdown.meals))) : null,
              )
            : null,

          (breakdown.equipment + breakdown.transport + breakdown.vehicles + breakdown.infrastructure + breakdown.systems) > 0
            ? e(
                View,
                { style: { marginBottom: 8 } },
                e(View, { style: [s.tblRow, { backgroundColor: '#fef3c7' }] }, e(Text, { style: [s.tblCellBold, { flex: 3, color: '#b45309' }] }, 'Costos Indirectos'), e(Text, { style: [s.tblCellBold, { flex: 2, textAlign: 'right' as const, color: '#b45309' }] }, fmtMoney(breakdown.equipment + breakdown.transport + breakdown.vehicles + breakdown.infrastructure + breakdown.systems))),
                breakdown.equipment > 0 ? e(View, { style: [s.tblRow, { paddingLeft: 16 }] }, e(Text, { style: [s.tblCell, { flex: 3 }] }, 'Equipo operativo'), e(Text, { style: [s.tblCell, { flex: 2, textAlign: 'right' as const }] }, fmtMoney(breakdown.equipment))) : null,
                breakdown.transport > 0 ? e(View, { style: [s.tblRow, { paddingLeft: 16 }] }, e(Text, { style: [s.tblCell, { flex: 3 }] }, 'Transporte'), e(Text, { style: [s.tblCell, { flex: 2, textAlign: 'right' as const }] }, fmtMoney(breakdown.transport))) : null,
                breakdown.vehicles > 0 ? e(View, { style: [s.tblRow, { paddingLeft: 16 }] }, e(Text, { style: [s.tblCell, { flex: 3 }] }, 'Vehiculos'), e(Text, { style: [s.tblCell, { flex: 2, textAlign: 'right' as const }] }, fmtMoney(breakdown.vehicles))) : null,
                breakdown.infrastructure > 0 ? e(View, { style: [s.tblRow, { paddingLeft: 16 }] }, e(Text, { style: [s.tblCell, { flex: 3 }] }, 'Infraestructura'), e(Text, { style: [s.tblCell, { flex: 2, textAlign: 'right' as const }] }, fmtMoney(breakdown.infrastructure))) : null,
                breakdown.systems > 0 ? e(View, { style: [s.tblRow, { paddingLeft: 16 }] }, e(Text, { style: [s.tblCell, { flex: 3 }] }, 'Sistemas'), e(Text, { style: [s.tblCell, { flex: 2, textAlign: 'right' as const }] }, fmtMoney(breakdown.systems))) : null,
              )
            : null,

          e(View, { style: [s.tblRow, { backgroundColor: C.slate100 }] }, e(Text, { style: [s.tblCellBold, { flex: 3 }] }, 'Subtotal costos base'), e(Text, { style: [s.tblCellBold, { flex: 2, textAlign: 'right' as const }] }, fmtMoney(breakdown.subtotalBase))),
          e(View, { style: [s.tblRow, { backgroundColor: '#d1fae5' }] }, e(Text, { style: [s.tblCellBold, { flex: 3, color: '#065f46' }] }, `Margen comercial (${breakdown.marginPct}% sobre precio venta)`), e(Text, { style: [s.tblCellBold, { flex: 2, textAlign: 'right' as const, color: '#065f46' }] }, fmtMoney(breakdown.marginAmount))),
          breakdown.financial > 0
            ? e(View, { style: [s.tblRow, { backgroundColor: '#fff7ed' }] }, e(Text, { style: [s.tblCellBold, { flex: 3, color: '#9a3412' }] }, `Costo financiero (${breakdown.financialRatePct}%)`), e(Text, { style: [s.tblCellBold, { flex: 2, textAlign: 'right' as const, color: '#9a3412' }] }, fmtMoney(breakdown.financial)))
            : null,
          e(
            View,
            { style: [s.grandTotal, { marginTop: 8 }] },
            e(Text, { style: s.grandTotalLabel }, 'PRECIO VENTA MENSUAL NETO'),
            e(Text, { style: s.grandTotalAmount }, fmtMoney(breakdown.grandTotal)),
          ),

          breakdown.positions.length > 0
            ? e(
                View,
                { style: { marginTop: 16 } },
                e(Text, { style: s.sectionTitle }, 'Valor Hora de Venta por Puesto'),
                ...breakdown.positions.map((pos, i) =>
                  e(
                    View,
                    { key: i, style: s.tblRow },
                    e(Text, { style: [s.tblCell, { flex: 3 }] }, `${pos.name} (${pos.totalGuardsInPosition} guardia${pos.totalGuardsInPosition !== 1 ? 's' : ''})`),
                    e(Text, { style: [s.tblCellBold, { flex: 2, textAlign: 'right' as const, color: '#0d9488' }] }, `${fmtMoney(Math.round(pos.hourlyRateSale))}/hr`),
                  ),
                ),
              )
            : null,

          e(Text, { style: s.netNote }, 'Estructura de costos con transparencia total · Valores netos · IVA se factura segun ley vigente'),

          // Fix 3: Signatures at end of last page (breakdown is the last page)
          sec.showSignature
            ? e(
                View,
                { wrap: false },
                e(
                  View,
                  { style: s.sigArea },
                  e(
                    View,
                    { style: s.sigBlock },
                    e(View, { style: s.sigLine }),
                    e(Text, { style: s.sigName }, companyConfig.companyName),
                    companyConfig.repLegalNombre
                      ? e(Text, { style: s.sigRole }, companyConfig.repLegalNombre)
                      : null,
                    e(Text, { style: s.sigRole }, 'Representante Legal'),
                  ),
                  e(
                    View,
                    { style: s.sigBlock },
                    e(View, { style: s.sigLine }),
                    e(Text, { style: s.sigName }, client.name),
                    e(Text, { style: s.sigRole }, 'Cliente'),
                  ),
                ),
                e(
                  View,
                  { style: s.contactBanner },
                  e(
                    View,
                    { style: { alignItems: 'center' as const } },
                    e(Text, { style: s.contactLabel }, 'EMAIL'),
                    e(Text, { style: s.contactValue }, companyConfig.email),
                  ),
                  e(
                    View,
                    { style: { alignItems: 'center' as const } },
                    e(Text, { style: s.contactLabel }, 'TELEFONO'),
                    e(Text, { style: s.contactValue }, companyConfig.phone),
                  ),
                  companyConfig.website
                    ? e(
                        View,
                        { style: { alignItems: 'center' as const } },
                        e(Text, { style: s.contactLabel }, 'WEB'),
                        e(Text, { style: s.contactValue }, companyConfig.website),
                      )
                    : null,
                ),
              )
            : null,
        ),
        pageFooter(),
      ),
    );
  }

  const doc = e(Document, null, ...pages);

  const buffer = await renderToBuffer(doc);
  return Buffer.from(buffer);
}
