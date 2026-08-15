/**
 * Layout A4 institucional compartido por propuestas comerciales y licitaciones.
 *
 * Debe permanecer sin JSX. React y react-pdf se cargan desde la misma instancia
 * para evitar incompatibilidades con el reconciler empaquetado por Next.js.
 */
import type {
  ProposalComplianceRow,
  ProposalProps,
  ProposalSectionSnapshot,
} from './build-proposal-props';
import { stripOrganigramRolesFromContent } from './map-v2-to-ai';
import {
  economicOpeningFromQuote,
  formatOpeningClp,
  formatOpeningPct,
  formatOpeningUf,
  openingAmountColumns,
} from '@/lib/cpq/economic-opening';
import {
  proposalColors,
  proposalFonts,
  proposalSpacing,
} from './proposal-theme';

export async function renderInstitutionalProposalToBufferFromProps(
  props: ProposalProps,
): Promise<Buffer> {
  // eslint-disable-next-line no-eval
  const nodeRequire = eval('require') as NodeRequire;
  const React = nodeRequire('react') as typeof import('react');
  const pdf = await import('@react-pdf/renderer');
  const path = nodeRequire('path') as typeof import('path');
  const {
    renderToBuffer,
    Document,
    Page,
    View,
    Text,
    StyleSheet,
    Image: PDFImage,
    Font,
  } = pdf;
  const h = React.createElement;
  const C = proposalColors;
  const F = proposalFonts;

  const fontsDir = path.join(process.cwd(), 'public', 'fonts');
  const registered = (globalThis as Record<string, unknown>).__pdfFontsRegistered;
  if (!registered) {
    Font.register({
      family: F.sans,
      fonts: [
        { src: path.join(fontsDir, 'PlusJakartaSans-Regular.ttf'), fontWeight: 400 },
        { src: path.join(fontsDir, 'PlusJakartaSans-Medium.ttf'), fontWeight: 500 },
        { src: path.join(fontsDir, 'PlusJakartaSans-SemiBold.ttf'), fontWeight: 600 },
        { src: path.join(fontsDir, 'PlusJakartaSans-Bold.ttf'), fontWeight: 700 },
        { src: path.join(fontsDir, 'PlusJakartaSans-ExtraBold.ttf'), fontWeight: 800 },
      ],
    });
    Font.register({
      family: F.mono,
      fonts: [
        { src: path.join(fontsDir, 'JetBrainsMono-Regular.ttf'), fontWeight: 400 },
        { src: path.join(fontsDir, 'JetBrainsMono-Medium.ttf'), fontWeight: 500 },
      ],
    });
    (globalThis as Record<string, unknown>).__pdfFontsRegistered = true;
  }
  Font.registerHyphenationCallback((word: string) => [word]);

  const styles = StyleSheet.create({
    cover: {
      fontFamily: F.sans,
      backgroundColor: C.navy,
      color: C.white,
      padding: 0,
    },
    coverMain: {
      flex: 1,
      paddingTop: 58,
      paddingHorizontal: 54,
    },
    coverLogo: {
      height: 42,
      maxWidth: 180,
      objectFit: 'contain',
      alignSelf: 'flex-start',
    },
    coverWordmark: {
      fontSize: 20,
      fontWeight: 800,
      letterSpacing: 2.4,
      color: C.white,
    },
    coverRule: {
      width: 112,
      height: 5,
      backgroundColor: C.accent,
      marginTop: 34,
      marginBottom: 34,
    },
    coverKicker: {
      color: C.accentLight,
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: 1.8,
      textTransform: 'uppercase',
      marginBottom: 10,
    },
    coverTitle: {
      fontSize: 29,
      fontWeight: 800,
      lineHeight: 1.12,
      letterSpacing: 0.5,
      maxWidth: 470,
      color: C.white,
    },
    coverClient: {
      fontSize: 20,
      fontWeight: 700,
      color: C.white,
      marginTop: 30,
    },
    coverInstallations: {
      fontSize: 10,
      lineHeight: 1.5,
      color: C.slate200,
      marginTop: 6,
      maxWidth: 430,
    },
    coverMetaPanel: {
      marginTop: 28,
      paddingTop: 14,
      borderTopWidth: 0.6,
      borderTopColor: C.navyMuted,
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    coverMetaItem: {
      width: '50%',
      marginBottom: 10,
      paddingRight: 12,
    },
    coverMetaLabel: {
      fontSize: 6.5,
      color: C.textSubtle,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      marginBottom: 2,
    },
    coverMetaValue: {
      fontSize: 9,
      color: C.white,
      lineHeight: 1.35,
    },
    coverBottom: {
      minHeight: 92,
      backgroundColor: C.navyLight,
      borderTopWidth: 4,
      borderTopColor: C.accent,
      paddingHorizontal: 54,
      paddingVertical: 20,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    coverBottomText: {
      fontSize: 8,
      color: C.slate200,
      lineHeight: 1.45,
      maxWidth: 380,
    },
    clientLogo: {
      height: 34,
      maxWidth: 110,
      objectFit: 'contain',
    },
    page: {
      fontFamily: F.sans,
      fontSize: 9,
      color: C.text,
      backgroundColor: C.paper,
      paddingTop: proposalSpacing.pageMarginTop,
      paddingBottom: proposalSpacing.pageMarginBottom,
      paddingHorizontal: proposalSpacing.pageMarginX,
    },
    header: {
      position: 'absolute',
      top: 18,
      left: proposalSpacing.pageMarginX,
      right: proposalSpacing.pageMarginX,
      height: 24,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderBottomWidth: 2,
      borderBottomColor: C.accent,
      paddingBottom: 7,
    },
    headerBrand: {
      fontSize: 8,
      fontWeight: 800,
      color: C.navy,
      letterSpacing: 1.1,
      textTransform: 'uppercase',
    },
    headerContext: {
      fontSize: 7,
      color: C.textMuted,
      textAlign: 'right',
    },
    footer: {
      position: 'absolute',
      bottom: 18,
      left: proposalSpacing.pageMarginX,
      right: proposalSpacing.pageMarginX,
      borderTopWidth: 0.5,
      borderTopColor: C.border,
      paddingTop: 6,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    footerText: {
      fontSize: 6.5,
      color: C.textSubtle,
    },
    watermark: {
      position: 'absolute',
      top: '43%',
      left: 0,
      right: 0,
      fontSize: 50,
      fontWeight: 700,
      color: C.slate400,
      opacity: 0.16,
      letterSpacing: 8,
      textAlign: 'center',
      transform: 'rotate(-18deg)',
    },
    sectionKicker: {
      fontSize: 7,
      fontWeight: 700,
      color: C.accent,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      marginBottom: 5,
    },
    h1: {
      fontSize: 19,
      fontWeight: 800,
      color: C.navy,
      lineHeight: 1.2,
      marginBottom: 8,
    },
    h2: {
      fontSize: 10,
      fontWeight: 700,
      color: C.navy,
      marginTop: 13,
      marginBottom: 6,
    },
    titleRule: {
      width: 46,
      height: 3,
      backgroundColor: C.accent,
      marginBottom: 16,
    },
    body: {
      fontSize: 9,
      color: C.text,
      lineHeight: 1.55,
      marginBottom: 8,
    },
    bulletRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 5,
      paddingLeft: 2,
    },
    bulletMark: {
      width: 12,
      color: C.accent,
      fontSize: 9,
      fontWeight: 700,
    },
    bulletText: {
      flex: 1,
      fontSize: 9,
      color: C.text,
      lineHeight: 1.5,
    },
    ref: {
      fontSize: 7,
      color: C.textMuted,
      backgroundColor: C.canvas,
      borderLeftWidth: 2,
      borderLeftColor: C.accent,
      paddingVertical: 5,
      paddingHorizontal: 8,
      marginBottom: 12,
    },
    tocRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 7,
      borderBottomWidth: 0.5,
      borderBottomColor: C.border,
    },
    tocNumber: {
      width: 28,
      fontFamily: F.mono,
      fontSize: 8,
      fontWeight: 500,
      color: C.accent,
    },
    tocTitle: {
      flex: 1,
      fontSize: 9,
      fontWeight: 600,
      color: C.navy,
    },
    tocRef: {
      fontSize: 6.5,
      color: C.textSubtle,
      maxWidth: 100,
      textAlign: 'right',
    },
    metricGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: 18,
      marginHorizontal: -4,
    },
    metricBox: {
      width: '31.8%',
      minHeight: 68,
      marginHorizontal: 4,
      marginBottom: 8,
      backgroundColor: C.canvas,
      borderTopWidth: 3,
      borderTopColor: C.accent,
      padding: 10,
    },
    metricValue: {
      fontSize: 16,
      fontWeight: 800,
      color: C.navy,
      marginBottom: 3,
    },
    metricLabel: {
      fontSize: 7,
      color: C.textMuted,
      lineHeight: 1.35,
    },
    orgRoot: {
      alignSelf: 'center',
      minWidth: 190,
      maxWidth: 300,
      backgroundColor: C.navy,
      paddingVertical: 10,
      paddingHorizontal: 16,
      alignItems: 'center',
      marginTop: 14,
    },
    orgRootText: {
      color: C.white,
      fontSize: 9,
      fontWeight: 700,
      textAlign: 'center',
    },
    orgLine: {
      width: 1,
      height: 14,
      backgroundColor: C.accent,
      alignSelf: 'center',
    },
    orgGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginHorizontal: -4,
    },
    orgRole: {
      width: '48.2%',
      minHeight: 38,
      marginHorizontal: 4,
      marginBottom: 8,
      paddingVertical: 8,
      paddingHorizontal: 9,
      backgroundColor: C.canvas,
      borderLeftWidth: 2,
      borderLeftColor: C.accent,
      justifyContent: 'center',
    },
    orgRoleText: {
      fontSize: 7.5,
      fontWeight: 600,
      color: C.navy,
      lineHeight: 1.35,
    },
    table: {
      marginTop: 8,
      borderWidth: 0.5,
      borderColor: C.border,
    },
    tableHeader: {
      flexDirection: 'row',
      backgroundColor: C.tableHeader,
      paddingVertical: 7,
      paddingHorizontal: 7,
    },
    tableHeaderText: {
      color: C.white,
      fontSize: 6.5,
      fontWeight: 700,
      letterSpacing: 0.25,
      textTransform: 'uppercase',
    },
    tableRow: {
      flexDirection: 'row',
      paddingVertical: 6,
      paddingHorizontal: 7,
      borderBottomWidth: 0.4,
      borderBottomColor: C.border,
    },
    tableRowAlt: {
      backgroundColor: C.tableRowAlt,
    },
    tableCell: {
      fontSize: 7.2,
      color: C.text,
      lineHeight: 1.35,
    },
    tableCellStrong: {
      fontSize: 7.2,
      color: C.navy,
      fontWeight: 600,
      lineHeight: 1.35,
    },
    economicHighlight: {
      flexDirection: 'row',
      paddingVertical: 8,
      paddingHorizontal: 7,
      backgroundColor: C.navy,
    },
    economicHighlightText: {
      color: C.white,
      fontSize: 7.5,
      fontWeight: 700,
    },
    note: {
      fontSize: 7,
      color: C.textMuted,
      lineHeight: 1.45,
      marginTop: 8,
    },
    certificationGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginHorizontal: -4,
      marginTop: 8,
    },
    certification: {
      width: '48.2%',
      marginHorizontal: 4,
      marginBottom: 8,
      padding: 8,
      backgroundColor: C.accentSoft,
      borderLeftWidth: 2,
      borderLeftColor: C.accent,
    },
    certificationText: {
      fontSize: 7.5,
      color: C.navy,
      fontWeight: 600,
      lineHeight: 1.4,
    },
    offererCard: {
      borderWidth: 0.7,
      borderColor: C.border,
      marginTop: 10,
    },
    offererRow: {
      flexDirection: 'row',
      borderBottomWidth: 0.4,
      borderBottomColor: C.border,
    },
    offererLabel: {
      width: '32%',
      padding: 7,
      backgroundColor: C.tableRowAlt,
      fontSize: 7,
      fontWeight: 700,
      color: C.navy,
    },
    offererValue: {
      width: '68%',
      padding: 7,
      fontSize: 7.5,
      color: C.text,
    },
    signature: {
      marginTop: 42,
      width: '58%',
      alignSelf: 'center',
      alignItems: 'center',
    },
    signatureLine: {
      width: '100%',
      borderTopWidth: 0.8,
      borderTopColor: C.navy,
      marginBottom: 7,
    },
    signatureName: {
      fontSize: 9,
      fontWeight: 700,
      color: C.navy,
      textAlign: 'center',
    },
    signatureRole: {
      fontSize: 7,
      color: C.textMuted,
      marginTop: 2,
      textAlign: 'center',
    },
  });

  const brand =
    props.offerer?.commercialName ||
    props.companyConfig.commercialName ||
    props.companyConfig.companyName ||
    'OPAI';
  const sourceSections: ProposalSectionSnapshot[] =
    props.proposalSections ?? props.licitacion?.sections ?? [];
  const sections = sourceSections.filter(
    (section) =>
      section.invariant !== 'matriz' &&
      section.invariant !== 'identificacion',
  );
  if (!sections.some((section) => section.kind === 'oferta_economica')) {
    sections.push({
      id: 'economic-opening',
      order: sections.length,
      title: 'Oferta económica — apertura completa',
      content: '',
      kind: 'oferta_economica',
    });
  }
  const matrix: ProposalComplianceRow[] =
    props.complianceMatrix ?? props.licitacion?.matrix ?? [];
  const indicators = (props.proposalMetrics ?? []).filter(
    (indicator) =>
      indicator.label.trim().length > 0 && indicator.value.trim().length > 0,
  );
  const references = props.referenceAccounts ?? [];
  const certifications = props.ai.certifications ?? [];
  const organigramRoles = (props.ai.organigramRoles ?? []).filter(
    (role) => !/\b\d+\s*(?:personas?|guardias?|supervisores?|inspectores?)\b/i.test(role),
  );
  const providerLogo =
    props.providerLogo ||
    props.companyConfig.brandingLogoWhite ||
    props.companyConfig.brandingLogoFull;
  const fetchImageAsDataUri = async (
    url: string | null | undefined,
  ): Promise<string | null> => {
    if (!url) return null;
    if (url.startsWith('data:')) return url;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) return null;
      let image = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get('content-type') || '';
      const isWebp = contentType.includes('webp') || url.toLowerCase().endsWith('.webp');
      if (isWebp) {
        const sharp = nodeRequire('sharp') as typeof import('sharp');
        image = Buffer.from(await sharp(image).png().toBuffer());
        return `data:image/png;base64,${image.toString('base64')}`;
      }
      const mime = contentType.includes('png') || url.toLowerCase().endsWith('.png')
        ? 'image/png'
        : 'image/jpeg';
      return `data:${mime};base64,${image.toString('base64')}`;
    } catch {
      return null;
    }
  };
  const [providerLogoUri, companyLogoUri] = await Promise.all([
    fetchImageAsDataUri(providerLogo),
    fetchImageAsDataUri(props.companyLogo),
  ]);
  const installationNames = props.installations?.length
    ? props.installations.map((installation) => installation.name).filter(Boolean)
    : props.installationName && props.installationName !== '-'
      ? [props.installationName]
      : [];
  const proposalKind =
    props.variant === 'licitacion' ? 'Licitación' : 'Propuesta comercial';

  const Header = () =>
    h(View, { style: styles.header, fixed: true },
      h(Text, { style: styles.headerBrand }, brand),
      h(Text, { style: styles.headerContext },
        `${proposalKind} · ${props.companyName} · ${props.quotationCode}`),
    );

  const Footer = () =>
    h(View, { style: styles.footer, fixed: true },
      h(Text, { style: styles.footerText },
        `CONFIDENCIAL · ${props.quotationCode}`),
      h(Text, { style: styles.footerText }, brand),
      h(Text, {
        style: styles.footerText,
        render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
          `Página ${pageNumber} de ${totalPages}`,
      }),
    );

  const Watermark = () =>
    props.watermark
      ? h(Text, { style: styles.watermark, fixed: true }, props.watermark)
      : null;

  const PageChrome = () => [Header(), Watermark(), Footer()];

  const sectionHeading = (number: string, title: string) => [
    h(Text, { key: `${number}-kicker`, style: styles.sectionKicker },
      number ? `Capítulo ${number}` : 'Anexo'),
    h(Text, { key: `${number}-title`, style: styles.h1 }, title),
    h(View, { key: `${number}-rule`, style: styles.titleRule }),
  ];

  const contentNodes = (
    value: string,
    keyPrefix: string,
  ): Array<import('react').ReactNode> => {
    const blocks = value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    return blocks.map((line, index) => {
      const bullet = /^[•●▪◦*\-–—]\s*/.test(line);
      const clean = line.replace(/^[•●▪◦*\-–—]\s*/, '').trim();
      return bullet
        ? h(View, { key: `${keyPrefix}-b-${index}`, style: styles.bulletRow },
            h(Text, { style: styles.bulletMark }, '●'),
            h(Text, { style: styles.bulletText }, clean),
          )
        : h(Text, { key: `${keyPrefix}-p-${index}`, style: styles.body }, clean);
    });
  };

  const tableHeader = (cells: Array<{ text: string; width: string }>) =>
    h(View, { style: styles.tableHeader },
      ...cells.map((cell, index) =>
        h(Text, {
          key: `head-${index}`,
          style: [styles.tableHeaderText, { width: cell.width }],
        }, cell.text),
      ),
    );

  const tableRow = (
    key: string,
    cells: Array<{ text: string; width: string; strong?: boolean; align?: 'left' | 'right' | 'center' }>,
    index: number,
    highlight = false,
  ) =>
    h(View, {
      key,
      style: highlight
        ? styles.economicHighlight
        : index % 2 === 1
          ? [styles.tableRow, styles.tableRowAlt]
          : styles.tableRow,
      wrap: false,
    },
      ...cells.map((cell, cellIndex) =>
        h(Text, {
          key: `${key}-${cellIndex}`,
          style: [
            highlight
              ? styles.economicHighlightText
              : cell.strong
                ? styles.tableCellStrong
                : styles.tableCell,
            { width: cell.width, textAlign: cell.align ?? 'left' },
          ],
        }, cell.text),
      ),
    );

  const opening = economicOpeningFromQuote({
    breakdown: props.breakdown,
    ufFallback: props.ufValue ?? 0,
    resourceBreakdown: props.resourceBreakdown,
    serviceLines: (props.installations?.length
      ? props.installations.flatMap((installation) =>
          installation.items.map((item) => ({
            ...item,
            description: `${installation.name} — ${item.description}`,
          })),
        )
      : props.items
    ).map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPriceClp:
        item.quantity > 0 ? item.subtotal / item.quantity : item.unitPrice,
      subtotalClp: item.subtotal,
    })),
    installations: props.installations?.length
      ? props.installations.map((installation) => ({
          name: installation.name,
          guards: installation.staffingCount,
          amountClp: installation.monthly,
        }))
      : props.installationName && props.installationName !== '-'
        ? [{
            name: props.installationName,
            guards: props.staffingCount,
            amountClp: props.totalNeto,
          }]
        : [],
  });
  if (!props.breakdown) {
    opening.currency = props.currency || opening.currency;
    opening.ufValue = props.ufValue ?? opening.ufValue;
    const saleRow = opening.rows.find((row) => row.key === 'sale');
    if (saleRow && props.totalNeto > 0) saleRow.amountClp = props.totalNeto;
  }
  const [primaryColumn, secondaryColumn] = openingAmountColumns(opening.currency);
  const serviceLines = opening.serviceLines ?? [];
  const byInstallation = opening.byInstallation ?? [];
  const salariesByRole = opening.salariesByRole ?? [];
  const directLines = opening.directLines ?? [];
  const indirectLines = opening.indirectLines ?? [];
  const amount = (kind: 'uf' | 'clp', clp: number) =>
    kind === 'uf'
      ? formatOpeningUf(clp, opening.ufValue)
      : formatOpeningClp(clp);

  const linesBlock = (
    key: string,
    title: string,
    lines: typeof directLines,
  ) => [
    h(Text, { key: `${key}-title`, style: styles.h2 }, title),
    lines.length === 0
      ? h(Text, { key: `${key}-empty`, style: styles.note }, 'No aplica')
      : h(View, { key: `${key}-table`, style: styles.table },
          tableHeader([
            { text: 'Concepto', width: '54%' },
            { text: 'Cant.', width: '14%' },
            { text: 'Monto mensual', width: '32%' },
          ]),
          ...lines.map((line, index) =>
            tableRow(`${key}-${index}`, [
              { text: line.label, width: '54%', strong: true },
              {
                text: line.quantity != null ? line.quantity.toLocaleString('es-CL') : '—',
                width: '14%',
                align: 'right' as const,
              },
              { text: formatOpeningClp(line.amountClp), width: '32%', align: 'right' as const, strong: true },
            ], index),
          ),
          tableRow(`${key}-subtotal`, [
            { text: 'Subtotal', width: '68%', strong: true },
            {
              text: formatOpeningClp(lines.reduce((sum, line) => sum + line.amountClp, 0)),
              width: '32%',
              align: 'right' as const,
              strong: true,
            },
          ], lines.length),
        ),
  ];

  const EconomicChapter = () =>
    h(View, null,
      ...(serviceLines.length > 0
        ? [
            h(Text, { key: 'economic-services-title', style: styles.h2 },
              'Cotización por servicios'),
            h(View, { key: 'economic-services-table', style: styles.table },
              tableHeader([
                { text: 'Servicio', width: '46%' },
                { text: 'Cant.', width: '10%' },
                { text: 'Valor unitario', width: '22%' },
                { text: 'Subtotal mensual', width: '22%' },
              ]),
              ...serviceLines.map((line, index) =>
                tableRow(`service-${index}`, [
                  { text: line.description, width: '46%', strong: true },
                  { text: line.quantity.toLocaleString('es-CL'), width: '10%', align: 'right' },
                  { text: formatOpeningClp(line.unitPriceClp), width: '22%', align: 'right' },
                  { text: formatOpeningClp(line.subtotalClp), width: '22%', align: 'right', strong: true },
                ], index),
              ),
            ),
          ]
        : []),
      ...(byInstallation.length > 0
        ? [
            h(Text, { key: 'economic-installations-title', style: styles.h2 },
              'Apertura por instalación'),
            h(View, { key: 'economic-installations-table', style: styles.table },
              tableHeader([
                { text: 'Instalación', width: '52%' },
                { text: 'Dotación', width: '16%' },
                { text: 'Monto mensual neto', width: '32%' },
              ]),
              ...byInstallation.map((installation, index) =>
                tableRow(`installation-${index}`, [
                  { text: installation.name, width: '52%', strong: true },
                  { text: installation.guards.toLocaleString('es-CL'), width: '16%', align: 'right' },
                  { text: formatOpeningClp(installation.amountClp), width: '32%', align: 'right', strong: true },
                ], index),
              ),
            ),
          ]
        : []),
      ...(salariesByRole.length > 0
        ? [
            h(Text, { key: 'economic-salaries-title', style: styles.h2 },
              'Sueldos por cargo · componentes del snapshot (por persona/mes)'),
            ...salariesByRole.flatMap((salary, salaryIndex) => [
              h(Text, {
                key: `salary-cargo-${salaryIndex}`,
                style: [styles.tableCellStrong, { marginTop: salaryIndex === 0 ? 4 : 10 }],
              }, `${salary.cargo} · ${salary.count.toLocaleString('es-CL')} persona(s)`),
              h(View, {
                key: `salary-table-${salaryIndex}`,
                style: styles.table,
                wrap: false,
                break: salary.components.length > 6,
              },
                tableHeader([
                  { text: 'Componente', width: '62%' },
                  { text: 'Monto', width: '38%' },
                ]),
                ...salary.components.map((component, index) =>
                  tableRow(`salary-${salaryIndex}-${index}`, [
                    { text: component.label, width: '62%' },
                    { text: formatOpeningClp(component.amountClp), width: '38%', align: 'right' },
                  ], index),
                ),
                tableRow(`salary-${salaryIndex}-total`, [
                  { text: 'Costo empresa', width: '62%', strong: true },
                  {
                    text: formatOpeningClp(salary.costoEmpresaClp),
                    width: '38%',
                    align: 'right',
                    strong: true,
                  },
                ], salary.components.length, true),
              ),
            ]),
          ]
        : []),
      ...linesBlock('direct', 'Costos directos', directLines),
      ...linesBlock('indirect', 'Costos indirectos', indirectLines),
      h(Text, { style: styles.h2 }, 'Estructura del precio'),
      h(View, { style: styles.table },
        tableHeader([
          { text: 'Concepto', width: '40%' },
          { text: primaryColumn === 'uf' ? 'UF' : 'CLP', width: '20%' },
          { text: secondaryColumn === 'uf' ? 'UF' : 'CLP', width: '20%' },
          { text: '%', width: '20%' },
        ]),
        ...opening.rows.map((row, index) =>
          tableRow(`opening-${row.key}`, [
            { text: row.label, width: '40%', strong: row.highlight },
            { text: amount(primaryColumn, row.amountClp), width: '20%', align: 'right', strong: row.highlight },
            { text: amount(secondaryColumn, row.amountClp), width: '20%', align: 'right' },
            { text: formatOpeningPct(row.pct), width: '20%', align: 'right' },
          ], index, row.highlight),
        ),
      ),
      ...(props.oneTimeItems?.length
        ? [
            h(Text, { key: 'one-time-title', style: styles.h2 }, 'Pagos únicos'),
            h(View, { key: 'one-time-table', style: styles.table },
              tableHeader([
                { text: 'Ítem', width: '72%' },
                { text: 'Cantidad', width: '10%' },
                { text: 'Valor', width: '18%' },
              ]),
              ...props.oneTimeItems.map((item, index) =>
                tableRow(`one-time-${index}`, [
                  { text: item.description, width: '72%', strong: true },
                  { text: item.quantity.toLocaleString('es-CL'), width: '10%', align: 'right' },
                  { text: item.subtotalFormatted, width: '18%', align: 'right', strong: true },
                ], index),
              ),
            ),
          ]
        : []),
      h(Text, { style: styles.note }, opening.note),
      h(Text, { style: styles.note },
        `Condiciones de pago: ${props.paymentTerms}` +
        (props.validUntil ? ` · Vigencia de la oferta: ${props.validUntil}` : '')),
    );

  const Portfolio = () =>
    references.length > 0
      ? h(View, { style: { marginTop: 14 } },
          h(Text, { style: styles.h2 }, 'Cartera de referencias autorizadas'),
          h(View, { style: styles.table },
            tableHeader([
              { text: 'Cuenta', width: '40%' },
              { text: 'Rubro / segmento', width: '32%' },
              { text: 'Ubicación', width: '28%' },
            ]),
            ...references.map((account, index) =>
              tableRow(`reference-${account.id}`, [
                { text: account.name, width: '40%', strong: true },
                { text: account.industry || account.segment || '—', width: '32%' },
                { text: [account.commune, account.city].filter(Boolean).join(', ') || '—', width: '28%' },
              ], index),
            ),
          ),
        )
      : null;

  const Certifications = () =>
    certifications.length > 0
      ? h(View, null,
          h(Text, { style: styles.h2 }, 'Certificaciones y cumplimiento declarados'),
          h(View, { style: styles.certificationGrid },
            ...certifications.map((certification, index) =>
              h(View, { key: `certification-${index}`, style: styles.certification, wrap: false },
                h(Text, { style: styles.certificationText }, certification),
              ),
            ),
          ),
        )
      : null;

  const Organigram = () =>
    organigramRoles.length > 0
      ? h(View, { style: { marginTop: 12 } },
          h(Text, { style: styles.h2 }, 'Estructura institucional por cargos'),
          h(View, { style: styles.orgRoot },
            h(Text, { style: styles.orgRootText },
              props.offerer?.legalRepresentative?.name
                ? 'Dirección y representación legal'
                : 'Dirección institucional'),
          ),
          h(View, { style: styles.orgLine }),
          h(View, { style: styles.orgGrid },
            ...organigramRoles.map((role, index) =>
              h(View, { key: `role-${index}`, style: styles.orgRole, wrap: false },
                h(Text, { style: styles.orgRoleText }, role),
              ),
            ),
          ),
        )
      : null;

  const cover = h(Page, { key: 'cover', size: 'A4', style: styles.cover },
    Watermark(),
    h(View, { style: styles.coverMain },
      providerLogoUri
        ? h(PDFImage, { src: providerLogoUri, style: styles.coverLogo })
        : h(Text, { style: styles.coverWordmark },
            props.companyConfig.brandNameUpper || brand.toUpperCase()),
      h(View, { style: styles.coverRule }),
      h(Text, { style: styles.coverKicker }, 'Documento confidencial'),
      h(Text, { style: styles.coverTitle }, 'PROPUESTA TÉCNICA Y ECONÓMICA'),
      h(Text, { style: styles.coverClient }, props.companyName),
      installationNames.length > 0
        ? h(Text, { style: styles.coverInstallations },
            `Instalaciones: ${installationNames.join(' · ')}`)
        : null,
      h(View, { style: styles.coverMetaPanel },
        h(View, { style: styles.coverMetaItem },
          h(Text, { style: styles.coverMetaLabel }, 'Código CPQ'),
          h(Text, { style: styles.coverMetaValue }, props.quotationCode),
        ),
        props.licitacionNumber
          ? h(View, { style: styles.coverMetaItem },
              h(Text, { style: styles.coverMetaLabel }, 'Licitación N°'),
              h(Text, { style: styles.coverMetaValue }, props.licitacionNumber),
            )
          : null,
        h(View, { style: styles.coverMetaItem },
          h(Text, { style: styles.coverMetaLabel }, 'Oferente'),
          h(Text, { style: styles.coverMetaValue },
            props.offerer?.legalName || brand),
        ),
        h(View, { style: styles.coverMetaItem },
          h(Text, { style: styles.coverMetaLabel }, 'Fecha'),
          h(Text, { style: styles.coverMetaValue }, props.proposalDate),
        ),
      ),
    ),
    h(View, { style: styles.coverBottom },
      h(Text, { style: styles.coverBottomText },
        `Preparada para ${props.contactName}` +
        (props.contactPosition ? ` · ${props.contactPosition}` : '') +
        `\n${brand}`),
      companyLogoUri
        ? h(PDFImage, { src: companyLogoUri, style: styles.clientLogo })
        : null,
    ),
  );

  const indexPage = h(Page, { key: 'index', size: 'A4', style: styles.page },
    ...PageChrome(),
    ...sectionHeading('00', 'Contenido de la propuesta'),
    ...sections.map((section, index) =>
      h(View, { key: `toc-${section.id}`, style: styles.tocRow, wrap: false },
        h(Text, { style: styles.tocNumber }, String(index + 1).padStart(2, '0')),
        h(Text, { style: styles.tocTitle }, section.title),
        section.ref ? h(Text, { style: styles.tocRef }, section.ref) : null,
      ),
    ),
    h(View, { style: styles.tocRow, wrap: false },
      h(Text, { style: styles.tocNumber }, 'A'),
      h(Text, { style: styles.tocTitle }, 'Matriz de cumplimiento'),
    ),
    h(View, { style: styles.tocRow, wrap: false },
      h(Text, { style: styles.tocNumber }, 'B'),
      h(Text, { style: styles.tocTitle }, 'Identificación del oferente y firma'),
    ),
    indicators.length > 0
      ? h(View, { style: styles.metricGrid },
          ...indicators.map((indicator, index) =>
            h(View, { key: `indicator-${index}`, style: styles.metricBox, wrap: false },
              h(Text, { style: styles.metricValue }, indicator.value),
              h(Text, { style: styles.metricLabel }, indicator.label),
            ),
          ),
        )
      : null,
  );

  let portfolioRendered = false;
  const sectionPages = sections.map((section, index) => {
    const isWho = /qui[eé]nes somos|organigrama/i.test(section.title);
    const isExperience = /experiencia|certificaci[oó]n/i.test(section.title);
    if (isExperience) portfolioRendered = references.length > 0;
    const bodyContent =
      isWho && organigramRoles.length > 0
        ? stripOrganigramRolesFromContent(section.content, organigramRoles)
        : section.content;
    return h(Page, {
      key: `section-${section.id}`,
      size: 'A4',
      style: styles.page,
      wrap: true,
    },
      ...PageChrome(),
      ...sectionHeading(String(index + 1).padStart(2, '0'), section.title),
      section.ref
        ? h(Text, { style: styles.ref }, `Referencia en bases: ${section.ref}`)
        : null,
      section.kind === 'oferta_economica'
        ? h(View, null,
            ...contentNodes(bodyContent, `economic-${section.id}`),
            h(EconomicChapter),
          )
        : h(View, null,
            ...contentNodes(bodyContent, section.id),
            isWho ? h(Organigram) : null,
            isExperience ? h(Certifications) : null,
            isExperience ? h(Portfolio) : null,
          ),
    );
  });

  const portfolioPage =
    references.length > 0 && !portfolioRendered
      ? h(Page, { key: 'portfolio', size: 'A4', style: styles.page, wrap: true },
          ...PageChrome(),
          ...sectionHeading('', 'Experiencia y referencias'),
          h(Certifications),
          h(Portfolio),
        )
      : null;

  const matrixPage = h(Page, { key: 'matrix', size: 'A4', style: styles.page, wrap: true },
    ...PageChrome(),
    ...sectionHeading('', 'Matriz de cumplimiento'),
    h(Text, { style: styles.body },
      'Trazabilidad de los requisitos citados en las secciones de esta propuesta.'),
    matrix.length > 0
      ? h(View, { style: styles.table },
          tableHeader([
            { text: 'Referencia', width: '20%' },
            { text: 'Requisito', width: '40%' },
            { text: 'Sección', width: '25%' },
            { text: 'Estado', width: '15%' },
          ]),
          ...matrix.map((row, index) =>
            tableRow(`matrix-${index}`, [
              { text: row.ref, width: '20%', strong: true },
              { text: row.requirement, width: '40%' },
              { text: row.sectionTitle ?? '—', width: '25%' },
              { text: row.level, width: '15%', strong: true },
            ], index),
          ),
        )
      : h(Text, { style: styles.note },
          'No se declararon referencias de bases para esta propuesta.'),
  );

  const offerer = props.offerer;
  const representative = offerer?.legalRepresentative;
  const offererRows = [
    ['Razón social', offerer?.legalName || props.companyConfig.companyName],
    ['Nombre comercial', offerer?.commercialName || brand],
    ['RUT', offerer?.rut || '—'],
    ['Domicilio', offerer?.address || '—'],
    ['Representante legal', representative?.name || '—'],
    ['RUT representante', representative?.rut || '—'],
    ['Contacto', offerer?.email || props.companyConfig.email || '—'],
  ];
  const offererPage = h(Page, { key: 'offerer', size: 'A4', style: styles.page },
    ...PageChrome(),
    ...sectionHeading('', 'Identificación del oferente'),
    h(Text, { style: styles.body },
      'Antecedentes institucionales del proveedor que presenta esta propuesta.'),
    h(View, { style: styles.offererCard },
      ...offererRows.map(([label, value], index) =>
        h(View, {
          key: `offerer-${index}`,
          style: index === offererRows.length - 1
            ? [styles.offererRow, { borderBottomWidth: 0 }]
            : styles.offererRow,
          wrap: false,
        },
          h(Text, { style: styles.offererLabel }, label),
          h(Text, { style: styles.offererValue }, value),
        ),
      ),
    ),
    h(View, { style: styles.signature },
      h(View, { style: styles.signatureLine }),
      h(Text, { style: styles.signatureName },
        representative?.name || 'Representante legal'),
      h(Text, { style: styles.signatureRole },
        `Representante legal · ${offerer?.legalName || brand}`),
      representative?.rut
        ? h(Text, { style: styles.signatureRole }, `RUT ${representative.rut}`)
        : null,
    ),
  );

  const doc = h(Document, {
    title: `Propuesta técnica y económica - ${props.companyName}`,
    author: brand,
    subject: props.quotationCode,
    language: 'es-CL',
  },
    cover,
    indexPage,
    ...sectionPages,
    portfolioPage,
    matrixPage,
    offererPage,
  );
  const buffer = await renderToBuffer(doc);
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}
