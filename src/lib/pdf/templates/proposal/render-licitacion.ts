/**
 * Renderer PDF del documento único — Propuesta Técnica y Económica.
 * Portada institucional, KPIs configurables, organigrama de cargos,
 * capítulo económico completo, matriz y firma.
 * Mismo contrato no-JSX / eval('require') que render-proposal.ts.
 */
import type { ProposalProps } from './build-proposal-props';
import {
  economicOpeningFromBreakdown,
  formatOpeningClp,
  formatOpeningPct,
  formatOpeningUf,
  openingAmountColumns,
} from '@/lib/cpq/economic-opening';
import { proposalColors as C } from './proposal-theme';

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
  const indicators = props.proposalIndicators?.length
    ? props.proposalIndicators
    : (props.proposalMetrics ?? []).map((m) => ({ label: m.label, value: m.value }));
  const orgRoles = props.orgRoles ?? [];
  const refs = props.referenceAccounts ?? [];
  const offerer = props.offerer;

  const styles = StyleSheet.create({
    page: {
      fontFamily: 'PlusJakartaSans',
      fontSize: 10,
      color: C.navy,
      paddingTop: 56,
      paddingBottom: 52,
      paddingHorizontal: 44,
      backgroundColor: '#ffffff',
    },
    header: {
      position: 'absolute',
      top: 16,
      left: 44,
      right: 44,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    headerBrand: { fontSize: 8, letterSpacing: 1.2, color: C.teal, textTransform: 'uppercase' },
    redLine: { height: 3, backgroundColor: C.accent, marginTop: 12, marginBottom: 8, width: 72 },
    footer: {
      position: 'absolute',
      bottom: 16,
      left: 44,
      right: 44,
      flexDirection: 'row',
      justifyContent: 'space-between',
      fontSize: 7,
      color: C.muted,
    },
    coverKicker: { fontSize: 9, letterSpacing: 2, color: C.accent, textTransform: 'uppercase', fontWeight: 600 },
    coverTitle: { fontSize: 24, fontWeight: 700, marginTop: 10, lineHeight: 1.2, color: C.navy },
    coverSub: { fontSize: 12, color: C.muted, marginTop: 8 },
    meta: { marginTop: 24, fontSize: 10, color: '#334155', lineHeight: 1.55 },
    h1: { fontSize: 13, fontWeight: 700, color: C.teal, marginBottom: 8, marginTop: 4 },
    h2: { fontSize: 11, fontWeight: 700, color: C.navy, marginBottom: 6, marginTop: 12 },
    body: { fontSize: 10, lineHeight: 1.55, color: '#1e293b' },
    ref: { fontSize: 8, color: C.teal, marginBottom: 6 },
    tocRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 4,
      borderBottomWidth: 0.4,
      borderBottomColor: C.line,
    },
    kpiRow: { flexDirection: 'row', gap: 8, marginTop: 20, flexWrap: 'wrap' },
    kpiBox: {
      width: '23%',
      borderWidth: 1,
      borderColor: C.line,
      borderRadius: 6,
      padding: 10,
      backgroundColor: '#f8fafc',
    },
    kpiValue: { fontSize: 14, fontWeight: 700, color: C.navy },
    kpiLabel: { fontSize: 8, color: C.muted, marginTop: 2 },
    orgRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
    orgChip: {
      borderWidth: 1,
      borderColor: C.teal,
      borderRadius: 4,
      paddingVertical: 6,
      paddingHorizontal: 10,
      backgroundColor: '#f0fdfa',
    },
    orgChipTxt: { fontSize: 9, color: C.teal, fontWeight: 600 },
    tableHeader: { flexDirection: 'row', backgroundColor: C.teal, paddingVertical: 6, paddingHorizontal: 6 },
    tableHeaderTxt: { color: '#ffffff', fontSize: 8, fontWeight: 600 },
    tableRow: {
      flexDirection: 'row',
      paddingVertical: 5,
      paddingHorizontal: 6,
      borderBottomWidth: 0.4,
      borderBottomColor: C.line,
    },
    ecoNote: { fontSize: 8, color: C.muted, marginTop: 8 },
    ecoHighlight: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 6, backgroundColor: '#ecfdf5' },
    signBox: {
      marginTop: 28,
      borderTopWidth: 1,
      borderTopColor: C.line,
      paddingTop: 16,
      width: '55%',
    },
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
    return h(
      View,
      { style: styles.header, fixed: true },
      h(Text, { style: styles.headerBrand }, brand),
      props.companyConfig?.brandingLogoFull
        ? h(PDFImage, {
            src: props.companyConfig.brandingLogoFull,
            style: { height: 16, width: 72, objectFit: 'contain' },
          })
        : null,
    );
  }

  function Footer() {
    return h(
      View,
      { style: styles.footer, fixed: true },
      h(Text, null, `Confidencial · ${brand} · Propuesta técnica y económica`),
      h(Text, {
        render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
          `${pageNumber} / ${totalPages}`,
      }),
    );
  }

  function Watermark() {
    if (!watermark) return null;
    return h(Text, { style: styles.watermark, fixed: true }, watermark);
  }

  const cover = h(
    Page,
    { size: 'A4', style: styles.page },
    Header(),
    Watermark(),
    h(View, { style: styles.redLine }),
    h(Text, { style: styles.coverKicker }, 'Documento comercial'),
    h(Text, { style: styles.coverTitle }, 'PROPUESTA TÉCNICA Y ECONÓMICA'),
    h(Text, { style: styles.coverSub }, props.installationName || props.companyName),
    h(
      View,
      { style: styles.meta },
      h(Text, null, `Cliente: ${props.companyName}`),
      props.installations?.length
        ? h(
            Text,
            null,
            `Instalaciones: ${props.installations.map((i) => i.name).join(', ')}`,
          )
        : h(Text, null, `Instalación: ${props.installationName || '—'}`),
      h(Text, null, `Cotización CPQ: ${props.quotationCode}`),
      props.licitacionNumber
        ? h(Text, null, `Licitación: ${props.licitacionNumber}`)
        : null,
      h(Text, null, `Fecha: ${props.proposalDate}`),
      h(Text, null, `Oferente: ${brand}`),
      h(Text, null, `Contacto: ${props.contactName}`),
    ),
    indicators.length
      ? h(
          View,
          { style: styles.kpiRow },
          ...indicators.slice(0, 4).map((kpi) =>
            h(
              View,
              { key: kpi.label, style: styles.kpiBox },
              h(Text, { style: styles.kpiValue }, kpi.value),
              h(Text, { style: styles.kpiLabel }, kpi.label),
            ),
          ),
        )
      : null,
    h(Text, { style: { ...styles.h1, marginTop: 28 } }, 'Índice'),
    ...sections.map((s, i) =>
      h(
        View,
        { key: s.id, style: styles.tocRow },
        h(Text, { style: { fontSize: 10 } }, `${i + 1}.  ${s.title}`),
        s.ref ? h(Text, { style: { fontSize: 8, color: C.teal } }, s.ref) : null,
      ),
    ),
    matrix.length
      ? h(Text, { style: { ...styles.tocRow, marginTop: 8, fontSize: 10 } }, 'Anexo.  Matriz de cumplimiento')
      : null,
    Footer(),
  );

  const opening = economicOpeningFromBreakdown(props.breakdown ?? null, props.ufValue ?? 0, {
    installationName: props.installationName,
  });
  const [primaryCol, secondaryCol] = openingAmountColumns(opening.currency);
  const fmtAmt = (kind: 'uf' | 'clp', clp: number) =>
    kind === 'uf' ? formatOpeningUf(clp, opening.ufValue) : formatOpeningClp(clp);

  function EcoHeader(cols: Array<{ label: string; w: string }>) {
    return h(
      View,
      { style: styles.tableHeader },
      ...cols.map((c) =>
        h(Text, { key: c.label, style: { ...styles.tableHeaderTxt, width: c.w } }, c.label),
      ),
    );
  }

  function EconomicTable() {
    const blocks: ReturnType<typeof h>[] = [];

    if (opening.services.length) {
      blocks.push(h(Text, { key: 'svc-h', style: styles.h2 }, 'Cotización por servicio'));
      blocks.push(
        EcoHeader([
          { label: 'Servicio / puesto', w: '40%' },
          { label: 'Dotación', w: '15%' },
          { label: primaryCol === 'uf' ? 'Venta UF' : 'Venta CLP', w: '22%' },
          { label: 'Costo MO', w: '23%' },
        ]),
      );
      for (const s of opening.services) {
        blocks.push(
          h(
            View,
            { key: `svc-${s.name}`, style: styles.tableRow },
            h(Text, { style: { fontSize: 8, width: '40%' } }, s.name),
            h(Text, { style: { fontSize: 8, width: '15%' } }, `${s.guards}×${s.puestos}`),
            h(Text, { style: { fontSize: 8, width: '22%', textAlign: 'right' } }, fmtAmt(primaryCol, s.saleClp)),
            h(Text, { style: { fontSize: 8, width: '23%', textAlign: 'right' } }, fmtAmt(primaryCol, s.laborClp)),
          ),
        );
      }
    }

    if (opening.installations.length) {
      blocks.push(h(Text, { key: 'inst-h', style: styles.h2 }, 'Apertura por instalación'));
      blocks.push(
        EcoHeader([
          { label: 'Instalación', w: '50%' },
          { label: primaryCol === 'uf' ? 'Venta UF' : 'Venta CLP', w: '25%' },
          { label: 'Mano de obra', w: '25%' },
        ]),
      );
      for (const inst of opening.installations) {
        blocks.push(
          h(
            View,
            { key: `inst-${inst.name}`, style: styles.tableRow },
            h(Text, { style: { fontSize: 8, width: '50%' } }, inst.name),
            h(Text, { style: { fontSize: 8, width: '25%', textAlign: 'right' } }, fmtAmt(primaryCol, inst.saleClp)),
            h(Text, { style: { fontSize: 8, width: '25%', textAlign: 'right' } }, fmtAmt(primaryCol, inst.laborClp)),
          ),
        );
      }
    }

    if (opening.salariesByCargo.length) {
      blocks.push(h(Text, { key: 'sal-h', style: styles.h2 }, 'Apertura de sueldos por cargo'));
      blocks.push(
        EcoHeader([
          { label: 'Cargo', w: '22%' },
          { label: 'N°', w: '8%' },
          { label: 'Base', w: '14%' },
          { label: 'Grat.', w: '14%' },
          { label: 'Col/Mov', w: '14%' },
          { label: 'Leyes', w: '14%' },
          { label: 'Costo', w: '14%' },
        ]),
      );
      for (const s of opening.salariesByCargo) {
        blocks.push(
          h(
            View,
            { key: `sal-${s.cargo}`, style: styles.tableRow },
            h(Text, { style: { fontSize: 7, width: '22%' } }, s.cargo),
            h(Text, { style: { fontSize: 7, width: '8%' } }, String(s.guards)),
            h(Text, { style: { fontSize: 7, width: '14%', textAlign: 'right' } }, formatOpeningClp(s.baseSalary)),
            h(Text, { style: { fontSize: 7, width: '14%', textAlign: 'right' } }, formatOpeningClp(s.gratification)),
            h(Text, { style: { fontSize: 7, width: '14%', textAlign: 'right' } }, formatOpeningClp(s.allowances)),
            h(Text, { style: { fontSize: 7, width: '14%', textAlign: 'right' } }, formatOpeningClp(s.socialLaws)),
            h(Text, { style: { fontSize: 7, width: '14%', textAlign: 'right' } }, formatOpeningClp(s.employerCost)),
          ),
        );
      }
    }

    blocks.push(h(Text, { key: 'str-h', style: styles.h2 }, 'Estructura del precio'));
    blocks.push(
      EcoHeader([
        { label: 'Concepto', w: '40%' },
        { label: primaryCol === 'uf' ? 'UF' : 'CLP', w: '20%' },
        { label: secondaryCol === 'uf' ? 'UF' : 'CLP', w: '20%' },
        { label: '%', w: '20%' },
      ]),
    );
    for (const row of opening.rows) {
      blocks.push(
        h(
          View,
          { key: row.key, style: row.highlight ? styles.ecoHighlight : styles.tableRow },
          h(Text, { style: { fontSize: 9, width: '40%', fontWeight: row.highlight ? 700 : 400 } }, row.label),
          h(Text, { style: { fontSize: 9, width: '20%', textAlign: 'right' } }, fmtAmt(primaryCol, row.amountClp)),
          h(Text, {
            style: { fontSize: 9, width: '20%', textAlign: 'right', color: C.muted },
          }, fmtAmt(secondaryCol, row.amountClp)),
          h(Text, { style: { fontSize: 9, width: '20%', textAlign: 'right' } }, formatOpeningPct(row.pct)),
        ),
      );
    }
    blocks.push(h(Text, { key: 'note', style: styles.ecoNote }, opening.note));
    return h(View, null, ...blocks);
  }

  function enrichSectionBody(title: string, content: string) {
    const nodes: ReturnType<typeof h>[] = [
      h(Text, { key: 'body', style: styles.body }, content?.trim() || '—'),
    ];

    if (/qui[eé]nes somos|organigrama/i.test(title) && orgRoles.length) {
      nodes.push(h(Text, { key: 'org-h', style: styles.h2 }, 'Organigrama operativo (cargos)'));
      nodes.push(
        h(
          View,
          { key: 'org', style: styles.orgRow },
          ...orgRoles.map((role) =>
            h(View, { key: role, style: styles.orgChip }, h(Text, { style: styles.orgChipTxt }, role)),
          ),
        ),
      );
    }

    if (/experiencia|certific/i.test(title)) {
      if (refs.length) {
        nodes.push(h(Text, { key: 'ref-h', style: styles.h2 }, 'Cartera de referencias'));
        nodes.push(
          EcoHeader([
            { label: 'Cliente', w: '50%' },
            { label: 'Rubro', w: '30%' },
            { label: 'Ciudad', w: '20%' },
          ]),
        );
        for (const a of refs) {
          nodes.push(
            h(
              View,
              { key: a.name, style: styles.tableRow },
              h(Text, { style: { fontSize: 8, width: '50%' } }, a.name),
              h(Text, { style: { fontSize: 8, width: '30%' } }, a.industry || '—'),
              h(Text, { style: { fontSize: 8, width: '20%' } }, a.city || '—'),
            ),
          );
        }
      }
      if (indicators.length) {
        nodes.push(h(Text, { key: 'ind-h', style: styles.h2 }, 'Indicadores del oferente'));
        nodes.push(
          h(
            View,
            { key: 'ind', style: styles.kpiRow },
            ...indicators.slice(0, 4).map((kpi) =>
              h(
                View,
                { key: `ind-${kpi.label}`, style: styles.kpiBox },
                h(Text, { style: styles.kpiValue }, kpi.value),
                h(Text, { style: styles.kpiLabel }, kpi.label),
              ),
            ),
          ),
        );
      }
    }

    if (/matriz|identificaci[oó]n del oferente|oferente/i.test(title) && offerer) {
      nodes.push(h(Text, { key: 'off-h', style: styles.h2 }, 'Identificación del oferente'));
      nodes.push(
        h(
          View,
          { key: 'off', style: styles.meta },
          offerer.legalName ? h(Text, null, `Razón social: ${offerer.legalName}`) : null,
          offerer.rut ? h(Text, null, `RUT: ${offerer.rut}`) : null,
          offerer.legalRepName ? h(Text, null, `Representante legal: ${offerer.legalRepName}`) : null,
          offerer.legalRepRut ? h(Text, null, `RUT representante: ${offerer.legalRepRut}`) : null,
        ),
      );
      nodes.push(
        h(
          View,
          { key: 'sign', style: styles.signBox },
          h(Text, { style: { fontSize: 9, color: C.muted } }, '_______________________________'),
          h(Text, { style: { fontSize: 9, marginTop: 4 } }, offerer.legalRepName || 'Representante legal'),
          h(Text, { style: { fontSize: 8, color: C.muted } }, offerer.legalRepRut || ''),
        ),
      );
    }

    return nodes;
  }

  const bodyPages = sections.map((s, i) =>
    h(
      Page,
      { key: s.id, size: 'A4', style: styles.page },
      Header(),
      Watermark(),
      h(View, { style: styles.redLine }),
      h(Text, { style: styles.h1 }, `${i + 1}.  ${s.title}`),
      s.kind === 'oferta_economica'
        ? EconomicTable()
        : [
            s.ref ? h(Text, { style: styles.ref }, `Referencia bases: ${s.ref}`) : null,
            ...enrichSectionBody(s.title, s.content),
          ],
      Footer(),
    ),
  );

  const col = (w: string) => ({ width: w });
  const matrixPage =
    matrix.length > 0 || props.licitacion?.status
      ? h(
          Page,
          { size: 'A4', style: styles.page },
          Header(),
          Watermark(),
          h(View, { style: styles.redLine }),
          h(Text, { style: styles.h1 }, 'Anexo. Matriz de cumplimiento'),
          h(
            Text,
            { style: { ...styles.body, marginBottom: 10 } },
            'Derivada del índice. CUMPLE / PARCIAL / EXCLUIDO según el contenido de cada sección y las exclusiones.',
          ),
          h(
            View,
            { style: styles.tableHeader },
            h(Text, { style: { ...styles.tableHeaderTxt, ...col('22%') } }, 'Ref.'),
            h(Text, { style: { ...styles.tableHeaderTxt, ...col('38%') } }, 'Requisito'),
            h(Text, { style: { ...styles.tableHeaderTxt, ...col('25%') } }, 'Sección'),
            h(Text, { style: { ...styles.tableHeaderTxt, ...col('15%') } }, 'Estado'),
          ),
          ...(matrix.length
            ? matrix.map((row, idx) =>
                h(
                  View,
                  { key: `${row.ref}-${idx}`, style: styles.tableRow },
                  h(Text, { style: { fontSize: 8, ...col('22%') } }, row.ref),
                  h(Text, { style: { fontSize: 8, ...col('38%') } }, row.requirement),
                  h(Text, { style: { fontSize: 8, ...col('25%') } }, row.sectionTitle ?? '—'),
                  h(Text, { style: { fontSize: 8, fontWeight: 600, ...col('15%') } }, row.level),
                ),
              )
            : [
                h(Text, { style: styles.body }, 'Sin requisitos citados. Completar referencias (§) en las secciones.'),
              ]),
          Footer(),
        )
      : null;

  const doc = h(Document, null, cover, ...bodyPages, matrixPage);
  const buffer = await renderToBuffer(doc);
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}
