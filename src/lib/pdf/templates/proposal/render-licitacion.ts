/**
 * Renderer PDF de propuesta de licitación (índice dinámico).
 * Mismo contrato no-JSX / eval('require') que render-proposal.ts.
 */
import type { ProposalProps } from './build-proposal-props';
import {
  economicOpeningFromQuote,
  formatOpeningClp,
  formatOpeningPct,
  formatOpeningUf,
  openingAmountColumns,
} from '@/lib/cpq/economic-opening';

export async function renderLicitacionProposalToBufferFromProps(
  props: ProposalProps,
): Promise<Buffer> {
  // eslint-disable-next-line no-eval
  const nodeRequire = eval('require') as NodeRequire;
  const React = nodeRequire('react') as typeof import('react');
  const pdf = await import('@react-pdf/renderer');
  const { renderToBuffer, Document, Page, View, Text, StyleSheet, Image: PDFImage } = pdf;
  const { Font } = pdf;
  const path = nodeRequire('path') as typeof import('path');

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
      ],
    });
    (globalThis as Record<string, unknown>).__pdfFontsRegistered = true;
  }

  const h = React.createElement;
  const brand = props.companyConfig?.commercialName || props.companyConfig?.companyName || 'OPAI';
  const sections = (props.licitacion?.sections ?? []).filter((s) => s.invariant !== 'matriz');
  const matrix = props.licitacion?.matrix ?? [];
  const watermark = props.watermark;

  const styles = StyleSheet.create({
    page: {
      fontFamily: 'PlusJakartaSans',
      fontSize: 10,
      color: '#1a2332',
      paddingTop: 56,
      paddingBottom: 48,
      paddingHorizontal: 48,
      backgroundColor: '#ffffff',
    },
    header: {
      position: 'absolute',
      top: 18,
      left: 48,
      right: 48,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    headerBrand: { fontSize: 8, letterSpacing: 1.2, color: '#0f766e', textTransform: 'uppercase' },
    footer: {
      position: 'absolute',
      bottom: 18,
      left: 48,
      right: 48,
      flexDirection: 'row',
      justifyContent: 'space-between',
      fontSize: 8,
      color: '#64748b',
    },
    coverTitle: { fontSize: 22, fontWeight: 700, marginTop: 48, lineHeight: 1.25 },
    coverSub: { fontSize: 12, color: '#475569', marginTop: 8 },
    meta: { marginTop: 28, fontSize: 10, color: '#334155', lineHeight: 1.5 },
    h1: { fontSize: 13, fontWeight: 700, color: '#0f766e', marginBottom: 8, marginTop: 4 },
    body: { fontSize: 10, lineHeight: 1.55, color: '#1e293b' },
    ref: { fontSize: 8, color: '#0f766e', marginBottom: 6 },
    tocRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 0.4, borderBottomColor: '#e2e8f0' },
    tableHeader: { flexDirection: 'row', backgroundColor: '#0f766e', paddingVertical: 6, paddingHorizontal: 6 },
    tableHeaderTxt: { color: '#ffffff', fontSize: 8, fontWeight: 600 },
    tableRow: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 6, borderBottomWidth: 0.4, borderBottomColor: '#e2e8f0' },
    ecoNote: { fontSize: 8, color: '#64748b', marginTop: 8 },
    ecoHighlight: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 6, backgroundColor: '#ecfdf5' },
    watermark: {
      position: 'absolute',
      top: '42%',
      left: 0,
      right: 0,
      textAlign: 'center',
      fontSize: 48,
      color: '#94a3b8',
      opacity: 0.18,
      letterSpacing: 8,
      transform: 'rotate(-18deg)',
    },
  });

  function Header() {
    return h(View, { style: styles.header, fixed: true },
      h(Text, { style: styles.headerBrand }, brand),
      props.companyConfig?.brandingLogoFull
        ? h(PDFImage, { src: props.companyConfig.brandingLogoFull, style: { height: 16, width: 72, objectFit: 'contain' } })
        : null,
    );
  }

  function Footer() {
    return h(View, { style: styles.footer, fixed: true },
      h(Text, null, `${brand} · Propuesta técnica de licitación`),
      h(Text, { render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => `${pageNumber} / ${totalPages}` }),
    );
  }

  function Watermark() {
    if (!watermark) return null;
    return h(Text, { style: styles.watermark, fixed: true }, watermark);
  }

  const cover = h(Page, { size: 'A4', style: styles.page },
    Header(),
    Watermark(),
    h(Text, { style: styles.coverTitle }, 'Propuesta técnica'),
    h(Text, { style: styles.coverSub }, props.installationName || props.companyName),
    h(View, { style: styles.meta },
      h(Text, null, `Cliente: ${props.companyName}`),
      h(Text, null, `Cotización: ${props.quotationCode}`),
      h(Text, null, `Fecha: ${props.proposalDate}`),
      h(Text, null, `Contacto: ${props.contactName}`),
    ),
    h(Text, { style: { ...styles.h1, marginTop: 36 } }, 'Índice'),
    ...sections.map((s, i) =>
      h(View, { key: s.id, style: styles.tocRow },
        h(Text, { style: { fontSize: 10 } }, `${i + 1}.  ${s.title}`),
        s.ref ? h(Text, { style: { fontSize: 8, color: '#0f766e' } }, s.ref) : null,
      ),
    ),
    h(Text, { style: { ...styles.tocRow, marginTop: 8, fontSize: 10 } }, 'Anexo.  Matriz de cumplimiento'),
    Footer(),
  );

  const opening = economicOpeningFromQuote({
    breakdown: props.breakdown,
    ufFallback: props.ufValue ?? 0,
    serviceLines: props.items.map((item) => ({
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
  const [primaryCol, secondaryCol] = openingAmountColumns(opening.currency);
  const fmtAmt = (kind: 'uf' | 'clp', clp: number) =>
    kind === 'uf' ? formatOpeningUf(clp, opening.ufValue) : formatOpeningClp(clp);

  function EconomicTable() {
    return h(View, null,
      ...(opening.serviceLines ?? []).length > 0
        ? [
            h(Text, { key: 'services-title', style: { ...styles.h1, fontSize: 10, marginTop: 8 } }, 'Cotización por servicios'),
            h(View, { key: 'services-head', style: styles.tableHeader },
              h(Text, { style: { ...styles.tableHeaderTxt, width: '46%' } }, 'Servicio'),
              h(Text, { style: { ...styles.tableHeaderTxt, width: '12%', textAlign: 'right' } }, 'Cant.'),
              h(Text, { style: { ...styles.tableHeaderTxt, width: '21%', textAlign: 'right' } }, 'Valor unitario'),
              h(Text, { style: { ...styles.tableHeaderTxt, width: '21%', textAlign: 'right' } }, 'Subtotal mensual'),
            ),
            ...(opening.serviceLines ?? []).map((line, index) =>
              h(View, { key: `service-${index}`, style: styles.tableRow },
                h(Text, { style: { fontSize: 8, width: '46%' } }, line.description),
                h(Text, { style: { fontSize: 8, width: '12%', textAlign: 'right' } }, line.quantity.toLocaleString('es-CL')),
                h(Text, { style: { fontSize: 8, width: '21%', textAlign: 'right' } }, formatOpeningClp(line.unitPriceClp)),
                h(Text, { style: { fontSize: 8, width: '21%', textAlign: 'right', fontWeight: 600 } }, formatOpeningClp(line.subtotalClp)),
              ),
            ),
          ]
        : [],
      ...(opening.byInstallation ?? []).length > 0
        ? [
            h(Text, { key: 'installations-title', style: { ...styles.h1, fontSize: 10, marginTop: 12 } }, 'Apertura por instalación'),
            h(View, { key: 'installations-head', style: styles.tableHeader },
              h(Text, { style: { ...styles.tableHeaderTxt, width: '50%' } }, 'Instalación'),
              h(Text, { style: { ...styles.tableHeaderTxt, width: '18%', textAlign: 'right' } }, 'Dotación'),
              h(Text, { style: { ...styles.tableHeaderTxt, width: '32%', textAlign: 'right' } }, 'Monto mensual neto'),
            ),
            ...(opening.byInstallation ?? []).map((installation, index) =>
              h(View, { key: `installation-${index}`, style: styles.tableRow },
                h(Text, { style: { fontSize: 8, width: '50%' } }, installation.name),
                h(Text, { style: { fontSize: 8, width: '18%', textAlign: 'right' } }, installation.guards.toLocaleString('es-CL')),
                h(Text, { style: { fontSize: 8, width: '32%', textAlign: 'right', fontWeight: 600 } }, formatOpeningClp(installation.amountClp)),
              ),
            ),
          ]
        : [],
      ...(opening.salariesByRole ?? []).length > 0
        ? [
            h(Text, { key: 'salaries-title', style: { ...styles.h1, fontSize: 10, marginTop: 12 } }, 'Sueldos por cargo · valores por persona al mes'),
            h(View, { key: 'salaries-head', style: styles.tableHeader },
              h(Text, { style: { ...styles.tableHeaderTxt, width: '22%', fontSize: 6 } }, 'Cargo'),
              h(Text, { style: { ...styles.tableHeaderTxt, width: '7%', fontSize: 6, textAlign: 'right' } }, 'Pers.'),
              h(Text, { style: { ...styles.tableHeaderTxt, width: '14%', fontSize: 6, textAlign: 'right' } }, 'Base'),
              h(Text, { style: { ...styles.tableHeaderTxt, width: '14%', fontSize: 6, textAlign: 'right' } }, 'Gratificación'),
              h(Text, { style: { ...styles.tableHeaderTxt, width: '15%', fontSize: 6, textAlign: 'right' } }, 'Colación/mov.'),
              h(Text, { style: { ...styles.tableHeaderTxt, width: '14%', fontSize: 6, textAlign: 'right' } }, 'Leyes sociales'),
              h(Text, { style: { ...styles.tableHeaderTxt, width: '14%', fontSize: 6, textAlign: 'right' } }, 'Costo empresa'),
            ),
            ...(opening.salariesByRole ?? []).map((salary) =>
              h(View, { key: `salary-${salary.cargo}`, style: styles.tableRow },
                h(Text, { style: { fontSize: 6.5, width: '22%' } }, salary.cargo),
                h(Text, { style: { fontSize: 6.5, width: '7%', textAlign: 'right' } }, salary.count.toLocaleString('es-CL')),
                h(Text, { style: { fontSize: 6.5, width: '14%', textAlign: 'right' } }, formatOpeningClp(salary.baseClp)),
                h(Text, { style: { fontSize: 6.5, width: '14%', textAlign: 'right' } }, formatOpeningClp(salary.gratificacionClp)),
                h(Text, { style: { fontSize: 6.5, width: '15%', textAlign: 'right' } }, formatOpeningClp(salary.colacionMovilizacionClp)),
                h(Text, { style: { fontSize: 6.5, width: '14%', textAlign: 'right' } }, formatOpeningClp(salary.leyesSocialesClp)),
                h(Text, { style: { fontSize: 6.5, width: '14%', textAlign: 'right', fontWeight: 600 } }, formatOpeningClp(salary.costoEmpresaClp)),
              ),
            ),
          ]
        : [],
      h(Text, { style: { ...styles.h1, fontSize: 10, marginTop: 12 } }, 'Estructura del precio'),
      h(View, { style: styles.tableHeader },
        h(Text, { style: { ...styles.tableHeaderTxt, width: '40%' } }, 'Concepto'),
        h(Text, { style: { ...styles.tableHeaderTxt, width: '20%', textAlign: 'right' } }, primaryCol === 'uf' ? 'UF' : 'CLP'),
        h(Text, { style: { ...styles.tableHeaderTxt, width: '20%', textAlign: 'right' } }, secondaryCol === 'uf' ? 'UF' : 'CLP'),
        h(Text, { style: { ...styles.tableHeaderTxt, width: '20%', textAlign: 'right' } }, '%'),
      ),
      ...opening.rows.map((row) =>
        h(View, { key: row.key, style: row.highlight ? styles.ecoHighlight : styles.tableRow },
          h(Text, { style: { fontSize: 9, width: '40%', fontWeight: row.highlight ? 700 : 400 } }, row.label),
          h(Text, { style: { fontSize: 9, width: '20%', textAlign: 'right' } }, fmtAmt(primaryCol, row.amountClp)),
          h(Text, { style: { fontSize: 9, width: '20%', textAlign: 'right', color: '#64748b' } }, fmtAmt(secondaryCol, row.amountClp)),
          h(Text, { style: { fontSize: 9, width: '20%', textAlign: 'right' } }, formatOpeningPct(row.pct)),
        ),
      ),
      h(Text, { style: styles.ecoNote }, opening.note),
    );
  }

  const bodyPages = sections.map((s, i) =>
    h(Page, { key: s.id, size: 'A4', style: styles.page },
      Header(),
      Watermark(),
      h(Text, { style: styles.h1 }, `${i + 1}.  ${s.title}`),
      s.kind === 'oferta_economica'
        ? EconomicTable()
        : [
            s.ref ? h(Text, { style: styles.ref }, `Referencia bases: ${s.ref}`) : null,
            h(Text, { style: styles.body }, s.content?.trim() || '—'),
          ],
      Footer(),
    ),
  );

  const col = (w: string) => ({ width: w });
  const matrixPage = h(Page, { size: 'A4', style: styles.page },
    Header(),
    Watermark(),
    h(Text, { style: styles.h1 }, 'Anexo. Matriz de cumplimiento'),
    h(Text, { style: { ...styles.body, marginBottom: 10 } },
      'Derivada del índice aprobado. CUMPLE / PARCIAL / EXCLUIDO según el contenido de cada sección y las exclusiones.'),
    h(View, { style: styles.tableHeader },
      h(Text, { style: { ...styles.tableHeaderTxt, ...col('22%') } }, 'Ref.'),
      h(Text, { style: { ...styles.tableHeaderTxt, ...col('38%') } }, 'Requisito'),
      h(Text, { style: { ...styles.tableHeaderTxt, ...col('25%') } }, 'Sección'),
      h(Text, { style: { ...styles.tableHeaderTxt, ...col('15%') } }, 'Estado'),
    ),
    ...(matrix.length
      ? matrix.map((row, idx) =>
          h(View, { key: `${row.ref}-${idx}`, style: styles.tableRow },
            h(Text, { style: { fontSize: 8, ...col('22%') } }, row.ref),
            h(Text, { style: { fontSize: 8, ...col('38%') } }, row.requirement),
            h(Text, { style: { fontSize: 8, ...col('25%') } }, row.sectionTitle ?? '—'),
            h(Text, { style: { fontSize: 8, fontWeight: 600, ...col('15%') } }, row.level),
          ),
        )
      : [h(Text, { style: styles.body }, 'Sin requisitos citados. Completar referencias (§) en las secciones.')]),
    Footer(),
  );

  const doc = h(Document, null, cover, ...bodyPages, matrixPage);
  const buffer = await renderToBuffer(doc);
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}
