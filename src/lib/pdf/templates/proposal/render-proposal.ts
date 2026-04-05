/**
 * Render Propuesta Técnica PDF using @react-pdf/renderer.
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

import * as path from 'path';
import type { ProposalProps } from './build-proposal-props';
import type { QuoteBreakdownData } from '@/types/cpq-breakdown';

export async function renderProposalToBuffer(
  quotationId: string,
  tenantId: string,
): Promise<Buffer> {
  const { buildProposalProps } = await import('./build-proposal-props');
  const props = await buildProposalProps(quotationId, tenantId);
  return renderProposalToBufferFromProps(props);
}

export async function renderProposalToBufferFromProps(
  props: ProposalProps,
): Promise<Buffer> {
  // eslint-disable-next-line no-eval
  const nodeRequire = eval('require') as NodeRequire;
  const React = nodeRequire('react');
  const pdf = await import('@react-pdf/renderer');
  const fs = nodeRequire('fs') as typeof import('fs');

  const {
    renderToBuffer,
    Document,
    Page,
    View,
    Text,
    StyleSheet,
    Image: PDFImage,
    Svg,
    Path,
  } = pdf;
  const { Font } = pdf;

  const path = nodeRequire('path');
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
    accent: '#e94560',
    accentLight: '#ff6b81',
    teal: '#14b8a6',
    text: '#334155',
    textLight: '#64748b',
    textLighter: '#94a3b8',
    bgLight: '#f8fafc',
    bgAlt: '#f1f5f9',
    border: '#e2e8f0',
    white: '#ffffff',
    highlightBg: '#fff1f2',
    success: '#16a34a',
    successBg: '#f0fdf4',
    danger: '#dc2626',
    dangerBg: '#fef2f2',
  };
  const F = { sans: 'PlusJakartaSans', mono: 'JetBrainsMono' };

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || '';
  const publicDir = path.join(process.cwd(), 'public');

  const loadLocalImage = (relativePath: string): string | null => {
    try {
      const filePath = path.join(publicDir, relativePath);
      if (!fs.existsSync(filePath)) return null;
      const buf = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase().replace('.', '');
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch { return null; }
  };

  const fetchImageAsDataUri = async (url: string): Promise<string | null> => {
    try {
      if (!url || url === '') return null;
      if (url.startsWith('data:')) return url;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      const arrBuf = await res.arrayBuffer();
      let buf: Buffer = Buffer.from(arrBuf);
      const ct = res.headers.get('content-type') || '';
      const urlLower = url.toLowerCase();
      const isWebp = ct.includes('webp') || urlLower.endsWith('.webp');
      let mime: string;
      if (isWebp) {
        try {
          const sharpMod = nodeRequire('sharp') as typeof import('sharp');
          buf = Buffer.from(await sharpMod(buf).png().toBuffer());
          mime = 'image/png';
        } catch {
          return null;
        }
      } else {
        mime = ct.includes('png') || urlLower.endsWith('.png') ? 'image/png' : 'image/jpeg';
      }
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch { return null; }
  };

  const guardPhotos = [
    { label: 'Control de acceso', file: 'guardias/entrada.jpg' },
    { label: 'Vigilancia en caseta', file: 'guardias/caseta.jpg' },
    { label: 'Recepción corporativa', file: 'guardias/recepcion.jpg' },
    { label: 'Seguridad industrial', file: 'guardias/cims.jpg' },
    { label: 'Conserje profesional', file: 'guardias/conserje.jpg' },
    { label: 'Seguridad integral', file: 'guardias/hero.jpg' },
  ].map(gp => ({ label: gp.label, src: loadLocalImage(gp.file) }))
   .filter(gp => gp.src !== null) as { label: string; src: string }[];

  const STATIC_CLIENT_LOGOS = [
    { name: 'Polpaico', file: 'clientes/Polpaico.png' },
    { name: 'International Paper', file: 'clientes/International_Paper.png' },
    { name: 'Tritec', file: 'clientes/Tritec.png' },
    { name: 'Sparta', file: 'clientes/Sparta.png' },
    { name: 'Tattersall', file: 'clientes/Tattersall.png' },
    { name: 'Transmat', file: 'clientes/Transmat.png' },
    { name: 'BBosch', file: 'clientes/BBosch.png' },
    { name: 'Embajada de Brasil', file: 'clientes/Embajada_Brasil.png' },
    { name: 'GL Events', file: 'clientes/GL_Events.png' },
    { name: 'Dhemax', file: 'clientes/Dhemax.png' },
    { name: 'eCars', file: 'clientes/eCars.png' },
    { name: 'Newtree', file: 'clientes/Newtree.png' },
  ].map(cl => ({ name: cl.name, src: loadLocalImage(cl.file) }))
   .filter(cl => cl.src !== null) as { name: string; src: string }[];

  const quoteCurrency = props.currency || 'CLP';
  const ufValue = props.ufValue ?? 0;
  const fmtMoney = (clp: number) => {
    if (quoteCurrency === 'UF' && ufValue > 0) {
      const uf = clp / ufValue;
      const formatted = new Intl.NumberFormat('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(uf);
      return `${formatted} UF`;
    }
    return `$${Math.round(clp).toLocaleString('es-CL')}`;
  };

  /* ─── Styles ─── */
  const s = StyleSheet.create({
    /* Cover page */
    coverPage: { fontFamily: F.sans, backgroundColor: C.navy, padding: 0 },
    coverContent: { flex: 1, paddingHorizontal: 50, paddingTop: 60, justifyContent: 'flex-start' as const },
    coverLogo: { height: 40, maxWidth: 160, objectFit: 'contain' as const },
    coverAccentLine: { width: 60, height: 4, backgroundColor: C.accent, marginTop: 30, marginBottom: 30 },
    coverTitle: { fontFamily: F.sans, fontSize: 28, fontWeight: 800, color: C.white, letterSpacing: 2 },
    coverSubtitle: { fontFamily: F.sans, fontSize: 14, color: C.textLighter, marginTop: 6, letterSpacing: 1 },
    coverCompany: { fontFamily: F.sans, fontSize: 22, fontWeight: 700, color: C.white, marginTop: 30 },
    coverAiDesc: { fontFamily: F.sans, fontSize: 10, color: C.textLighter, marginTop: 12, lineHeight: 1.6 },
    coverMetrics: { flexDirection: 'row' as const, marginTop: 30, gap: 10 },
    coverMetricBadge: { flex: 1, backgroundColor: C.navyLight, borderRadius: 6, padding: 10, alignItems: 'center' as const },
    coverMetricValue: { fontFamily: F.sans, fontSize: 18, fontWeight: 800, color: C.accent },
    coverMetricLabel: { fontFamily: F.sans, fontSize: 7, color: C.textLighter, textAlign: 'center' as const, marginTop: 4 },
    coverFooter: { paddingHorizontal: 50, paddingBottom: 40 },
    coverFooterText: { fontFamily: F.sans, fontSize: 9, color: C.textLighter },
    coverFooterRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, marginTop: 10 },
    coverClientLogo: { height: 30, maxWidth: 100, objectFit: 'contain' as const },

    /* Content pages */
    page: { fontFamily: F.sans, fontSize: 9, color: C.text, backgroundColor: C.white, paddingBottom: 50 },
    headerBand: { backgroundColor: C.navy, paddingHorizontal: 30, paddingVertical: 12, flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const },
    headerBrandRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
    headerLogo: { height: 22, maxWidth: 80, objectFit: 'contain' as const },
    headerBrandName: { fontFamily: F.sans, fontWeight: 800, fontSize: 14, color: C.white, letterSpacing: 1.5 },
    headerRight: { fontFamily: F.sans, fontSize: 8, color: C.textLighter, textAlign: 'right' as const },
    accentLine: { height: 3, backgroundColor: C.accent },
    body: { paddingHorizontal: 30, paddingTop: 10 },
    footer: { position: 'absolute' as const, bottom: 18, left: 30, right: 30, flexDirection: 'row' as const, justifyContent: 'space-between' as const, borderTop: `0.5 solid ${C.border}`, paddingTop: 6 },
    footerText: { fontFamily: F.sans, fontSize: 7, color: C.textLighter },

    /* Section titles */
    sectionTitle: { fontFamily: F.sans, fontSize: 13, fontWeight: 700, color: C.navy, paddingBottom: 6, borderBottom: `2 solid ${C.accent}`, marginBottom: 10, marginTop: 18 },
    sectionSubtitle: { fontFamily: F.sans, fontSize: 10, fontWeight: 600, color: C.navyLight, marginBottom: 6, marginTop: 10 },

    /* Paragraph */
    para: { fontFamily: F.sans, fontSize: 9, color: C.text, lineHeight: 1.6, marginBottom: 6 },
    paraItalic: { fontFamily: F.sans, fontSize: 9, color: C.textLight, lineHeight: 1.6, marginBottom: 6 },

    /* Highlight boxes */
    highlightRow: { flexDirection: 'row' as const, gap: 8, marginTop: 10, marginBottom: 6 },
    highlightBox: { flex: 1, backgroundColor: C.highlightBg, borderRadius: 4, padding: 8, borderLeft: `3 solid ${C.accent}` },
    highlightLabel: { fontFamily: F.sans, fontSize: 7, color: C.textLight, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 2 },
    highlightValue: { fontFamily: F.sans, fontSize: 10, fontWeight: 700, color: C.navy },

    /* Two-column */
    twoCol: { flexDirection: 'row' as const, gap: 14 },
    col: { flex: 1 },

    /* Cards */
    card: { backgroundColor: C.bgLight, borderRadius: 6, padding: 10, marginBottom: 8, border: `0.5 solid ${C.border}` },
    cardAccent: { backgroundColor: C.bgLight, borderRadius: 6, padding: 10, marginBottom: 8, borderLeft: `3 solid ${C.accent}` },
    cardTeal: { backgroundColor: C.bgLight, borderRadius: 6, padding: 10, marginBottom: 8, borderLeft: `3 solid ${C.teal}` },
    cardTitle: { fontFamily: F.sans, fontSize: 10, fontWeight: 700, color: C.navy, marginBottom: 4 },
    cardText: { fontFamily: F.sans, fontSize: 8, color: C.text, lineHeight: 1.5 },

    /* Bullets */
    bulletItem: { flexDirection: 'row' as const, marginBottom: 4, paddingLeft: 4 },
    bulletDot: { fontFamily: F.sans, fontSize: 9, color: C.accent, fontWeight: 700, marginRight: 6, width: 8 },
    bulletText: { fontFamily: F.sans, fontSize: 9, color: C.text, flex: 1, lineHeight: 1.5 },

    /* Table */
    tblHeader: { flexDirection: 'row' as const, backgroundColor: C.bgAlt, borderBottom: `1.5 solid ${C.accent}`, paddingVertical: 6, paddingHorizontal: 8 },
    tblHeaderCell: { fontFamily: F.sans, fontSize: 7, fontWeight: 700, color: C.navyLight, textTransform: 'uppercase' as const, letterSpacing: 0.3 },
    tblRow: { flexDirection: 'row' as const, paddingVertical: 5, paddingHorizontal: 8, borderBottom: `0.5 solid ${C.border}` },
    tblCell: { fontFamily: F.sans, fontSize: 8, color: C.text },
    tblCellBold: { fontFamily: F.sans, fontSize: 8, fontWeight: 600, color: C.navy },

    /* Grand total */
    grandTotal: { flexDirection: 'row' as const, backgroundColor: C.navy, paddingVertical: 10, paddingHorizontal: 12, marginTop: 6, borderRadius: 4, alignItems: 'center' as const },
    grandTotalLabel: { fontFamily: F.sans, fontSize: 11, fontWeight: 700, color: C.white, flex: 1 },
    grandTotalAmount: { fontFamily: F.mono, fontSize: 14, fontWeight: 700, color: C.teal },

    /* Photo grid */
    photoGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8, marginTop: 8 },
    photoCell: { width: '31%', borderRadius: 4, overflow: 'hidden' as const },
    photoImg: { width: '100%', height: 90, objectFit: 'cover' as const },
    photoLabel: { fontFamily: F.sans, fontSize: 7, color: C.textLight, textAlign: 'center' as const, paddingTop: 3, paddingBottom: 3, backgroundColor: C.bgAlt },

    /* Logo grid */
    logoGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8, marginTop: 8 },
    logoCell: { width: '30%', height: 50, backgroundColor: C.white, borderRadius: 4, border: `0.5 solid ${C.border}`, justifyContent: 'center' as const, alignItems: 'center' as const, padding: 6 },
    logoImg: { maxHeight: 30, maxWidth: 80, objectFit: 'contain' as const },
    logoName: { fontFamily: F.sans, fontSize: 6, color: C.textLighter, textAlign: 'center' as const, marginTop: 2 },

    /* Comparison table */
    compRow: { flexDirection: 'row' as const, borderBottom: `0.5 solid ${C.border}` },
    compCellLabel: { flex: 2, padding: 6, fontFamily: F.sans, fontSize: 8, fontWeight: 600, color: C.navy, backgroundColor: C.bgAlt },
    compCellBad: { flex: 1.5, padding: 6, fontFamily: F.sans, fontSize: 8, color: C.danger, backgroundColor: C.dangerBg, textAlign: 'center' as const },
    compCellGood: { flex: 1.5, padding: 6, fontFamily: F.sans, fontSize: 8, color: C.success, backgroundColor: C.successBg, textAlign: 'center' as const },

    /* Pyramid */
    pyramidLevel: { alignItems: 'center' as const, marginBottom: 4 },

    /* Metric badge */
    metricRow: { flexDirection: 'row' as const, gap: 8, marginTop: 8, marginBottom: 8 },
    metricBadge: { flex: 1, backgroundColor: C.bgLight, borderRadius: 6, padding: 8, alignItems: 'center' as const, border: `0.5 solid ${C.border}` },
    metricValue: { fontFamily: F.sans, fontSize: 16, fontWeight: 800, color: C.accent },
    metricLabel: { fontFamily: F.sans, fontSize: 7, color: C.textLight, textAlign: 'center' as const, marginTop: 2 },

    /* FAQ */
    faqItem: { marginBottom: 8, paddingBottom: 8, borderBottom: `0.5 solid ${C.border}` },
    faqQ: { fontFamily: F.sans, fontSize: 9, fontWeight: 700, color: C.navy, marginBottom: 3 },
    faqA: { fontFamily: F.sans, fontSize: 8, color: C.text, lineHeight: 1.5 },

    /* Signature */
    sigArea: { flexDirection: 'row' as const, marginTop: 16, gap: 40 },
    sigBlock: { flex: 1, alignItems: 'center' as const },
    sigLine: { width: '80%', borderBottom: `1 solid ${C.text}`, marginBottom: 6, marginTop: 30 },
    sigName: { fontFamily: F.sans, fontSize: 9, fontWeight: 600, color: C.navy },
    sigRole: { fontFamily: F.sans, fontSize: 7, color: C.textLight, marginTop: 2 },

    /* Stepped list */
    stepRow: { flexDirection: 'row' as const, marginBottom: 6, alignItems: 'flex-start' as const },
    stepCircle: { width: 22, height: 22, borderRadius: 11, backgroundColor: C.accent, justifyContent: 'center' as const, alignItems: 'center' as const, marginRight: 8 },
    stepNum: { fontFamily: F.sans, fontSize: 10, fontWeight: 700, color: C.white },
    stepContent: { flex: 1, paddingTop: 2 },

    /* Contact banner */
    contactBanner: { backgroundColor: C.navy, padding: 12, borderRadius: 4, marginTop: 14, flexDirection: 'row' as const, justifyContent: 'space-around' as const, alignItems: 'center' as const },
    contactLabel: { fontFamily: F.sans, fontSize: 7, color: '#93c5fd', marginBottom: 1 },
    contactValue: { fontFamily: F.sans, fontSize: 9, fontWeight: 600, color: C.white },

    /* SLA cards */
    slaCard: { flex: 1, backgroundColor: C.bgLight, borderRadius: 6, padding: 8, border: `0.5 solid ${C.border}` },
    slaTime: { fontFamily: F.sans, fontSize: 14, fontWeight: 800, color: C.accent },
    slaLabel: { fontFamily: F.sans, fontSize: 7, color: C.textLight, marginTop: 2 },

    /* Breakdown helper */
    bdRow: { flexDirection: 'row' as const, paddingVertical: 4, paddingHorizontal: 10, borderBottom: `0.5 solid ${C.border}` },
    bdLabel: { fontFamily: F.sans, fontSize: 8, color: C.text, flex: 3 },
    bdValue: { fontFamily: F.sans, fontSize: 8, fontWeight: 600, color: C.navy, flex: 2, textAlign: 'right' as const },
    bdCatHeader: { flexDirection: 'row' as const, paddingVertical: 5, paddingHorizontal: 10 },
  });

  /* ─── Destructure props ─── */
  const {
    companyName, companyLogo, quotationCode, proposalDate, contactName, contactPosition,
    ai, serviceType, installationName, installationAddress, coverageSchedule,
    staffingCount, staffingRegime, supervisionFrequency,
    items, totalNetoFormatted, paymentTerms, regimeExplanation,
    companyConfig, companyStats, clientLogosWithNames, providerLogo,
    breakdown, resourceBreakdown, includedItems,
  } = props;

  const clientLogosData: { name: string; src: string }[] = await (async () => {
    if (clientLogosWithNames.length > 0) {
      const resolved = await Promise.all(
        clientLogosWithNames.map(async (cl) => {
          const src = await fetchImageAsDataUri(cl.url);
          return src ? { name: cl.name, src } : null;
        }),
      );
      return resolved.filter((x): x is { name: string; src: string } => x !== null);
    }
    return STATIC_CLIENT_LOGOS;
  })();

  const providerLogoUri = providerLogo ? await fetchImageAsDataUri(providerLogo) : null;
  const companyLogoUri = companyLogo ? await fetchImageAsDataUri(companyLogo) : null;

  /* ─── Reusable sub-trees ─── */

  const shieldSvg = e(
    Svg, { width: 22, height: 22, viewBox: '0 0 24 24' },
    e(Path, { d: 'M12 2L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z', fill: C.teal }),
    e(Path, { d: 'M10 15.5l-3.5-3.5 1.41-1.41L10 12.67l5.59-5.59L17 8.5l-7 7z', fill: C.white }),
  );

  const headerLogo = providerLogoUri
    ? e(PDFImage, { src: providerLogoUri, style: s.headerLogo })
    : shieldSvg;

  const header = e(
    View, { fixed: true },
    e(View, { style: s.headerBand },
      e(View, { style: s.headerBrandRow },
        headerLogo,
        e(Text, { style: s.headerBrandName }, companyConfig.brandNameUpper || ''),
      ),
      e(Text, { style: s.headerRight }, `PROPUESTA TÉCNICA · ${companyName}`),
    ),
    e(View, { style: s.accentLine }),
  );

  const pageFooter = e(
    View, { style: s.footer, fixed: true },
    e(Text, { style: s.footerText }, `Confidencial · N° ${quotationCode}`),
    e(Text, { style: s.footerText }, `${companyConfig.commercialName}${companyConfig.website ? ` · ${companyConfig.website}` : ''}`),
    e(Text, {
      style: s.footerText,
      render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
        `Página ${pageNumber} de ${totalPages}`,
    }),
  );

  const sectionTitle = (text: string) =>
    e(Text, { style: s.sectionTitle }, text);

  const bullet = (text: string, key?: number) =>
    e(View, { key, style: s.bulletItem },
      e(Text, { style: s.bulletDot }, '\u25CF'),
      e(Text, { style: s.bulletText }, text),
    );

  /* ═══════════════════════════════════════════
   * PAGE 1: COVER
   * ═══════════════════════════════════════════ */

  const coverPage = e(
    Page, { key: 'cover', size: 'A4', style: s.coverPage },
    e(View, { style: s.coverContent },
      providerLogoUri
        ? e(PDFImage, { src: providerLogoUri, style: s.coverLogo })
        : e(Text, { style: { fontFamily: F.sans, fontSize: 24, fontWeight: 800, color: C.white, letterSpacing: 3 } }, companyConfig.brandNameUpper || ''),
      e(View, { style: s.coverAccentLine }),
      e(Text, { style: s.coverTitle }, 'PROPUESTA TÉCNICA'),
      e(Text, { style: s.coverSubtitle }, 'DE SERVICIO DE SEGURIDAD INTEGRAL'),
      e(Text, { style: s.coverCompany }, companyName),
      ai.descripcionBreve
        ? e(Text, { style: s.coverAiDesc }, ai.descripcionBreve)
        : null,
      e(View, { style: s.coverMetrics },
        e(View, { style: s.coverMetricBadge }, e(Text, { style: s.coverMetricValue }, '67%'), e(Text, { style: s.coverMetricLabel }, 'Reducción incidentes')),
        e(View, { style: s.coverMetricBadge }, e(Text, { style: s.coverMetricValue }, '96%'), e(Text, { style: s.coverMetricLabel }, 'Rondas cumplidas')),
        e(View, { style: s.coverMetricBadge }, e(Text, { style: s.coverMetricValue }, '100%'), e(Text, { style: s.coverMetricLabel }, 'Documentado')),
        e(View, { style: s.coverMetricBadge }, e(Text, { style: s.coverMetricValue }, '94%'), e(Text, { style: s.coverMetricLabel }, 'Renovación')),
      ),
    ),
    e(View, { style: s.coverFooter },
      e(Text, { style: s.coverFooterText }, `Preparada para: ${contactName}${contactPosition ? ` · ${contactPosition}` : ''}`),
      e(View, { style: s.coverFooterRow },
        e(Text, { style: s.coverFooterText }, `${proposalDate} · ${quotationCode}`),
        companyLogoUri
          ? e(PDFImage, { src: companyLogoUri, style: s.coverClientLogo })
          : null,
      ),
    ),
  );

  /* ═══════════════════════════════════════════
   * PAGES 2+: CONTENT (single Page, wrap: true)
   * ═══════════════════════════════════════════ */

  const sections: unknown[] = [];

  /* ── 1. Resumen Ejecutivo ── */
  sections.push(
    e(View, { key: 'sec1' },
      sectionTitle('Resumen Ejecutivo'),
      ...(ai.resumenEjecutivo || '').split('\n').filter(Boolean).map((p: string, i: number) =>
        e(Text, { key: i, style: s.para }, p),
      ),
      e(View, { style: s.highlightRow },
        e(View, { style: s.highlightBox }, e(Text, { style: s.highlightLabel }, 'Servicio'), e(Text, { style: s.highlightValue }, serviceType)),
        e(View, { style: s.highlightBox }, e(Text, { style: s.highlightLabel }, 'Dotación'), e(Text, { style: s.highlightValue }, `${staffingCount} guardias`)),
      ),
      e(View, { style: s.highlightRow },
        e(View, { style: s.highlightBox }, e(Text, { style: s.highlightLabel }, 'Cobertura'), e(Text, { style: s.highlightValue }, coverageSchedule)),
        e(View, { style: s.highlightBox }, e(Text, { style: s.highlightLabel }, 'Inversión Mensual'), e(Text, { style: s.highlightValue }, totalNetoFormatted)),
      ),
    ),
  );

  /* ── 2. Ecosistema ── */
  sections.push(
    e(View, { key: 'sec2', wrap: false },
      sectionTitle('Ecosistema'),
      e(View, { style: s.twoCol },
        e(View, { style: s.col },
          e(Text, { style: s.sectionSubtitle }, companyConfig.commercialName),
          e(Text, { style: s.para }, 'Empresa de seguridad privada integral con operaciones en múltiples regiones de Chile. Combinamos personal altamente capacitado con tecnología de última generación para entregar un servicio preventivo, documentado y medible.'),
        ),
        e(View, { style: s.col },
          e(Text, { style: s.sectionSubtitle }, 'LX3.ai'),
          e(Text, { style: s.para }, 'Brazo tecnológico desarrollador de OPAI, la plataforma de inteligencia operacional que integra rondas GPS, control de acceso biométrico, reportes automáticos e inteligencia artificial para análisis predictivo de riesgos.'),
        ),
      ),
      e(Text, { style: [s.sectionSubtitle, { marginTop: 12 }] }, `${companyConfig.commercialName} en números`),
      e(View, { style: s.metricRow },
        e(View, { style: s.metricBadge }, e(Text, { style: s.metricValue }, companyStats.yearsInOperation), e(Text, { style: s.metricLabel }, 'Años operando')),
        e(View, { style: s.metricBadge }, e(Text, { style: s.metricValue }, companyStats.activeGuards), e(Text, { style: s.metricLabel }, 'Guardias activos')),
        e(View, { style: s.metricBadge }, e(Text, { style: s.metricValue }, companyStats.protectedFacilities), e(Text, { style: s.metricLabel }, 'Instalaciones protegidas')),
        e(View, { style: s.metricBadge }, e(Text, { style: s.metricValue }, companyStats.regionsCount), e(Text, { style: s.metricLabel }, 'Regiones')),
      ),
    ),
  );

  /* ── 3. Nuestra Gente ── */
  sections.push(
    e(View, { key: 'sec3', wrap: false },
      sectionTitle('Nuestra Gente'),
      e(Text, { style: s.para }, 'Cada guardia pasa por un riguroso proceso de selección, capacitación continua y evaluación de desempeño. Nuestro equipo se especializa en seguridad preventiva con enfoque en servicio al cliente.'),
      e(View, { style: s.photoGrid },
        ...guardPhotos.map((gp, i) =>
          e(View, { key: i, style: s.photoCell },
            e(PDFImage, { src: gp.src, style: s.photoImg }),
            e(Text, { style: s.photoLabel }, gp.label),
          ),
        ),
      ),
    ),
  );

  /* ── 4. Organigrama ── */
  sections.push(
    e(View, { key: 'sec4', wrap: false },
      sectionTitle('Organigrama'),
      e(Text, { style: s.sectionSubtitle }, 'Estructura corporativa'),
      e(View, { style: [s.twoCol, { marginBottom: 10 }] },
        e(View, { style: [s.card, { flex: 1 }] }, e(Text, { style: s.cardTitle }, 'Gerencia General'), e(Text, { style: s.cardText }, 'Dirección estratégica y relación con clientes clave')),
        e(View, { style: [s.card, { flex: 1 }] }, e(Text, { style: s.cardTitle }, 'Gerencia de Operaciones'), e(Text, { style: s.cardText }, 'Supervisión de servicios, dotación y calidad')),
      ),
      e(View, { style: [s.twoCol, { marginBottom: 10 }] },
        e(View, { style: [s.card, { flex: 1 }] }, e(Text, { style: s.cardTitle }, 'Jefatura de RRHH'), e(Text, { style: s.cardText }, 'Selección, capacitación y bienestar del personal')),
        e(View, { style: [s.card, { flex: 1 }] }, e(Text, { style: s.cardTitle }, 'Tecnología (LX3.ai)'), e(Text, { style: s.cardText }, 'Desarrollo OPAI, soporte técnico e innovación')),
      ),
      e(Text, { style: s.sectionSubtitle }, 'Su cadena de servicio directa'),
      ...['Ejecutivo de cuenta — su contacto directo para requerimientos y seguimiento.',
        'Jefe de operaciones — coordina supervisores y asegura cumplimiento del SLA.',
        'Supervisor de turno — presente en terreno, fiscaliza rondas y procedimientos.',
        'Guardias asignados — equipo fijo que conoce su instalación en detalle.',
      ].map((txt, i) =>
        e(View, { key: i, style: s.stepRow },
          e(View, { style: s.stepCircle }, e(Text, { style: s.stepNum }, String(i + 1))),
          e(View, { style: s.stepContent }, e(Text, { style: s.para }, txt)),
        ),
      ),
    ),
  );

  /* ── 5. OPAI Platform ── */
  sections.push(
    e(View, { key: 'sec5', break: true, wrap: false },
      sectionTitle('Plataforma OPAI'),
      e(Text, { style: s.para }, 'OPAI (Operational AI) es nuestra plataforma propietaria de gestión de seguridad. Centraliza el control operacional, automatiza reportes y proporciona inteligencia en tiempo real sobre el desempeño del servicio.'),
      ...['Rondas GPS con geofence y evidencia fotográfica',
        'Control de acceso biométrico y facial',
        'Libro de novedades digital con alertas',
        'Reportes automáticos diarios, semanales y mensuales',
        'Panel de KPIs en tiempo real',
        'Gestión de incidentes con workflow de escalamiento',
        'Portal de clientes con visibilidad 24/7',
        'Capacitación y evaluación digital del personal',
        'Integración con cámaras y sistemas de alarma',
        'Análisis predictivo con inteligencia artificial',
      ].map((txt, i) => bullet(txt, i)),
    ),
  );

  /* ── 6. 6 Portales ── */
  const portalNames = [
    { title: 'Portal Clientes', desc: 'Visibilidad en tiempo real de su servicio, reportes y KPIs.' },
    { title: 'Portal Guardias', desc: 'App móvil para rondas, novedades, asistencia y capacitación.' },
    { title: 'Portal Supervisores', desc: 'Control de operaciones en terreno, checklists y fiscalización.' },
    { title: 'Portal Rondas', desc: 'Gestión de rutas, checkpoints GPS y evidencia fotográfica.' },
    { title: 'Portal Acceso', desc: 'Control de ingreso biométrico, visitas y vehículos.' },
    { title: 'Portal Administración', desc: 'RRHH, nómina, uniformes, equipamiento y planificación.' },
  ];
  sections.push(
    e(View, { key: 'sec6', wrap: false },
      sectionTitle('6 Portales Integrados'),
      e(View, { style: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 } },
        ...portalNames.map((p, i) =>
          e(View, { key: i, style: [s.cardAccent, { width: '48%' }] },
            e(Text, { style: s.cardTitle }, p.title),
            e(Text, { style: s.cardText }, p.desc),
          ),
        ),
      ),
    ),
  );

  /* ── 7. Tecnología Incluida ── */
  const techItems = [
    { func: 'Rondas GPS', que: 'Checkpoints georeferenciados con evidencia', benef: 'Verificación objetiva de cumplimiento' },
    { func: 'Control de Acceso', que: 'Registro biométrico/facial de ingresos', benef: 'Trazabilidad completa de visitantes' },
    { func: 'Libro de Novedades', que: 'Registro digital de eventos operacionales', benef: 'Información en tiempo real para decisiones' },
    { func: 'Reportes Automáticos', que: 'Generación AI de informes periódicos', benef: 'Ahorro de tiempo y consistencia' },
    { func: 'Panel KPIs', que: 'Dashboard de métricas operacionales', benef: 'Visibilidad instantánea del servicio' },
    { func: 'Gestión Incidentes', que: 'Workflow de detección → reporte → acción', benef: 'Respuesta rápida y documentada' },
    { func: 'Capacitación Digital', que: 'Cursos y evaluaciones en plataforma', benef: 'Personal siempre actualizado' },
    { func: 'Análisis Predictivo', que: 'IA identifica patrones de riesgo', benef: 'Prevención proactiva de incidentes' },
    { func: 'App Móvil', que: 'Aplicación nativa para guardias', benef: 'Operación sin papel, datos en la nube' },
    { func: 'Integración CCTV', que: 'Conexión con cámaras existentes', benef: 'Centro de monitoreo unificado' },
  ];
  sections.push(
    e(View, { key: 'sec7', break: true },
      sectionTitle('Tecnología Incluida'),
      e(View, { style: s.tblHeader },
        e(Text, { style: [s.tblHeaderCell, { flex: 1.5 }] }, 'FUNCIONALIDAD'),
        e(Text, { style: [s.tblHeaderCell, { flex: 2.5 }] }, 'QUÉ ES'),
        e(Text, { style: [s.tblHeaderCell, { flex: 2 }] }, 'BENEFICIO'),
      ),
      ...techItems.map((t, i) =>
        e(View, { key: i, style: s.tblRow },
          e(Text, { style: [s.tblCellBold, { flex: 1.5 }] }, t.func),
          e(Text, { style: [s.tblCell, { flex: 2.5 }] }, t.que),
          e(Text, { style: [s.tblCell, { flex: 2 }] }, t.benef),
        ),
      ),
    ),
  );

  /* ── 8. Desarrollo a Medida ── */
  sections.push(
    e(View, { key: 'sec8', wrap: false },
      sectionTitle('Desarrollo a Medida'),
      e(Text, { style: s.para }, 'Nuestro equipo de desarrollo puede adaptar la plataforma OPAI a los requerimientos específicos de su operación. Esto incluye:'),
      ...['Integraciones con sistemas ERP, SAP o similares',
        'Dashboards personalizados para gerencia',
        'Flujos de aprobación y escalamiento custom',
        'Módulos específicos por industria',
        'APIs para conexión con terceros',
      ].map((txt, i) => bullet(txt, i)),
      e(View, { style: [s.cardTeal, { marginTop: 8 }] },
        e(Text, { style: s.cardText }, 'El desarrollo a medida está incluido sin costo adicional para clientes con contrato vigente, sujeto a evaluación de alcance.'),
      ),
    ),
  );

  /* ── 9. Tabla Comparativa ── */
  const compRows = [
    { label: 'Rondas verificadas', bad: 'Manual, sin registro', good: 'GPS + foto + timestamp' },
    { label: 'Reportes', bad: 'Excel mensual', good: 'Automáticos diarios con AI' },
    { label: 'Visibilidad cliente', bad: 'Nula o por email', good: 'Portal 24/7 en tiempo real' },
    { label: 'Control de acceso', bad: 'Libro en papel', good: 'Biométrico + registro digital' },
    { label: 'Capacitación', bad: 'Esporádica', good: 'Continua con evaluación digital' },
    { label: 'Incidentes', bad: 'Reporte verbal', good: 'Workflow con SLA documentado' },
    { label: 'Supervisión', bad: 'Reactiva', good: 'Proactiva con datos en tiempo real' },
    { label: 'Tecnología', bad: 'Ninguna o básica', good: 'OPAI + AI + IoT integrado' },
  ];
  sections.push(
    e(View, { key: 'sec9', wrap: false },
      sectionTitle('Tabla Comparativa'),
      e(View, { style: s.compRow },
        e(Text, { style: [s.compCellLabel, { fontWeight: 700 }] }, 'Aspecto'),
        e(Text, { style: [s.compCellBad, { fontWeight: 700, color: C.navy }] }, 'Mercado Tradicional'),
        e(Text, { style: [s.compCellGood, { fontWeight: 700, color: C.navy }] }, `${companyConfig.commercialName} + OPAI`),
      ),
      ...compRows.map((r, i) =>
        e(View, { key: i, style: s.compRow },
          e(Text, { style: s.compCellLabel }, r.label),
          e(Text, { style: s.compCellBad }, r.bad),
          e(Text, { style: s.compCellGood }, r.good),
        ),
      ),
    ),
  );

  /* ── 10. Pirámide ── */
  const pyramidLevels = [
    { label: 'Inteligencia Artificial', width: '40%', bg: C.accent },
    { label: 'Análisis Predictivo', width: '52%', bg: '#ff6b81' },
    { label: 'Plataforma OPAI', width: '64%', bg: C.teal },
    { label: 'Supervisión + Tecnología', width: '78%', bg: '#0d9488' },
    { label: 'Guardias Capacitados', width: '92%', bg: C.navy },
  ];
  sections.push(
    e(View, { key: 'sec10', wrap: false },
      sectionTitle('Pirámide de Valor'),
      ...pyramidLevels.map((lv, i) =>
        e(View, { key: i, style: s.pyramidLevel },
          e(View, { style: { width: lv.width, backgroundColor: lv.bg, borderRadius: 4, paddingVertical: 8, alignItems: 'center' as const } },
            e(Text, { style: { fontFamily: F.sans, fontSize: 9, fontWeight: 700, color: C.white } }, lv.label),
          ),
        ),
      ),
    ),
  );

  /* ── 11. 4 Pilares ── */
  const pilares = [
    { title: 'Prevención', desc: 'Anticipamos riesgos con análisis predictivo, rondas verificadas y protocolos proactivos.' },
    { title: 'Tecnología', desc: 'OPAI integra IoT, biometría, GPS y AI para un servicio medible y transparente.' },
    { title: 'Capital Humano', desc: 'Selección rigurosa, capacitación continua y evaluación de desempeño permanente.' },
    { title: 'Cumplimiento', desc: 'Adherencia total a Ley 21.659, OS-10 y normativa laboral vigente.' },
  ];
  sections.push(
    e(View, { key: 'sec11', wrap: false },
      sectionTitle('4 Pilares del Servicio'),
      e(View, { style: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 } },
        ...pilares.map((p, i) =>
          e(View, { key: i, style: [s.cardAccent, { width: '48%' }] },
            e(Text, { style: s.cardTitle }, p.title),
            e(Text, { style: s.cardText }, p.desc),
          ),
        ),
      ),
    ),
  );

  /* ── 12. SLA + Escalamiento ── */
  sections.push(
    e(View, { key: 'sec12', break: true },
      sectionTitle('SLA + Escalamiento'),
      e(View, { style: [s.twoCol, { gap: 8, marginBottom: 10 }] },
        e(View, { style: s.slaCard }, e(Text, { style: s.slaTime }, '< 5 min'), e(Text, { style: s.slaLabel }, 'Detección de incidente')),
        e(View, { style: s.slaCard }, e(Text, { style: s.slaTime }, '< 15 min'), e(Text, { style: s.slaLabel }, 'Reporte al cliente')),
        e(View, { style: s.slaCard }, e(Text, { style: s.slaTime }, '< 30 min'), e(Text, { style: s.slaLabel }, 'Acción correctiva')),
      ),
      e(Text, { style: s.sectionSubtitle }, 'Compromisos de nivel de servicio'),
      e(View, { style: s.tblHeader },
        e(Text, { style: [s.tblHeaderCell, { flex: 2 }] }, 'INDICADOR'),
        e(Text, { style: [s.tblHeaderCell, { flex: 1, textAlign: 'center' as const }] }, 'META'),
      ),
      ...([
        ['Cumplimiento de rondas', '≥ 96%'],
        ['Asistencia del personal', '≥ 98%'],
        ['Tiempo de respuesta a incidentes', '< 15 min'],
        ['Informes entregados a tiempo', '100%'],
        ['Satisfacción del cliente', '≥ 90%'],
      ] as [string, string][]).map((r, i) =>
        e(View, { key: i, style: s.tblRow },
          e(Text, { style: [s.tblCell, { flex: 2 }] }, r[0]),
          e(Text, { style: [s.tblCellBold, { flex: 1, textAlign: 'center' as const }] }, r[1]),
        ),
      ),
      e(Text, { style: s.sectionSubtitle }, 'Escalamiento'),
      ...['Nivel 1 — Guardia en sitio resuelve en < 5 min.',
        'Nivel 2 — Supervisor notificado, se presenta en < 30 min.',
        'Nivel 3 — Jefe de operaciones interviene en < 1 hora.',
        'Nivel 4 — Gerencia + cliente informados, plan de acción en < 2 horas.',
      ].map((txt, i) =>
        e(View, { key: i, style: s.stepRow },
          e(View, { style: s.stepCircle }, e(Text, { style: s.stepNum }, String(i + 1))),
          e(View, { style: s.stepContent }, e(Text, { style: s.para }, txt)),
        ),
      ),
    ),
  );

  /* ── 13. Reportabilidad ── */
  sections.push(
    e(View, { key: 'sec13', wrap: false },
      sectionTitle('Reportabilidad'),
      e(View, { style: [s.twoCol, { gap: 8 }] },
        e(View, { style: s.cardAccent },
          e(Text, { style: s.cardTitle }, 'Reporte Diario'),
          e(Text, { style: s.cardText }, 'Novedades, asistencia, rondas realizadas, incidentes del turno. Entregado automáticamente por OPAI.'),
        ),
        e(View, { style: s.cardAccent },
          e(Text, { style: s.cardTitle }, 'Reporte Semanal'),
          e(Text, { style: s.cardText }, 'Resumen de KPIs, tendencias, alertas y recomendaciones. Incluye comparativa con semanas anteriores.'),
        ),
        e(View, { style: s.cardAccent },
          e(Text, { style: s.cardTitle }, 'Reporte Mensual'),
          e(Text, { style: s.cardText }, 'Informe ejecutivo con métricas, cumplimiento SLA, análisis de riesgos y plan de mejora continua.'),
        ),
      ),
    ),
  );

  /* ── 14. Cumplimiento Legal ── */
  sections.push(
    e(View, { key: 'sec14', break: true, wrap: false },
      sectionTitle('Cumplimiento Legal'),
      e(Text, { style: s.sectionSubtitle }, 'Certificaciones'),
      ...['Acreditación OS-10 de Carabineros de Chile',
        'Ley 21.659 de Seguridad Privada',
        'DS N° 44 (2025) Marco preventivo de seguridad',
        'ISO 18788 — Operaciones de seguridad privada',
      ].map((txt, i) => bullet(txt, i)),
      e(Text, { style: s.sectionSubtitle }, 'Screening de personal'),
      ...['Verificación de antecedentes penales y comerciales',
        'Exámenes psicológicos y psicométricos',
        'Test de drogas y alcohol',
        'Verificación de referencias laborales',
      ].map((txt, i) => bullet(txt, i)),
      e(Text, { style: s.sectionSubtitle }, 'Seguros'),
      ...['Póliza de responsabilidad civil extracontractual',
        'Seguro de fidelidad funcionaria',
        'Ley 16.744 — Accidentes del trabajo',
        'Seguro complementario de salud para guardias',
      ].map((txt, i) => bullet(txt, i)),
    ),
  );

  /* ── 15. Contingencia ── */
  sections.push(
    e(View, { key: 'sec15', wrap: false },
      sectionTitle('Plan de Contingencia'),
      e(View, { style: s.tblHeader },
        e(Text, { style: [s.tblHeaderCell, { flex: 1.5 }] }, 'ESCENARIO'),
        e(Text, { style: [s.tblHeaderCell, { flex: 2.5 }] }, 'ACCIÓN'),
        e(Text, { style: [s.tblHeaderCell, { flex: 1, textAlign: 'center' as const }] }, 'TIEMPO'),
      ),
      ...([
        ['Inasistencia guardia', 'Reemplazo desde equipo de respaldo', '< 2 hrs'],
        ['Licencia médica', 'Activación de guardia suplente', '< 4 hrs'],
        ['Emergencia en sitio', 'Protocolo de crisis + supervisor en terreno', '< 30 min'],
        ['Falla tecnológica', 'Soporte remoto + contingencia manual', '< 1 hr'],
        ['Evento masivo', 'Refuerzo de dotación previa coordinación', '24 hrs previas'],
      ] as [string, string, string][]).map((r, i) =>
        e(View, { key: i, style: s.tblRow },
          e(Text, { style: [s.tblCellBold, { flex: 1.5 }] }, r[0]),
          e(Text, { style: [s.tblCell, { flex: 2.5 }] }, r[1]),
          e(Text, { style: [s.tblCellBold, { flex: 1, textAlign: 'center' as const }] }, r[2]),
        ),
      ),
      e(View, { style: [s.metricRow, { justifyContent: 'center' as const }] },
        e(View, { style: [s.metricBadge, { maxWidth: 180 }] },
          e(Text, { style: s.metricValue }, '99.5%'),
          e(Text, { style: s.metricLabel }, 'Disponibilidad garantizada'),
        ),
      ),
    ),
  );

  /* ── 16. Resultados ── */
  sections.push(
    e(View, { key: 'sec16', break: true },
      sectionTitle('Resultados'),
      e(View, { style: s.metricRow },
        e(View, { style: s.metricBadge }, e(Text, { style: s.metricValue }, '67%'), e(Text, { style: s.metricLabel }, 'Reducción de incidentes')),
        e(View, { style: s.metricBadge }, e(Text, { style: s.metricValue }, '96%'), e(Text, { style: s.metricLabel }, 'Cumplimiento de rondas')),
        e(View, { style: s.metricBadge }, e(Text, { style: s.metricValue }, '94%'), e(Text, { style: s.metricLabel }, 'Tasa de renovación')),
        e(View, { style: s.metricBadge }, e(Text, { style: s.metricValue }, '4.8'), e(Text, { style: s.metricLabel }, 'Satisfacción (de 5.0)')),
      ),
      ai.sectoresRelevantes && ai.sectoresRelevantes.length > 0
        ? e(View, null,
            e(Text, { style: s.sectionSubtitle }, 'Sectores con experiencia relevante'),
            e(View, { style: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6 } },
              ...ai.sectoresRelevantes.map((sec: string, i: number) =>
                e(View, { key: i, style: { backgroundColor: C.bgAlt, borderRadius: 10, paddingVertical: 3, paddingHorizontal: 10, marginBottom: 4 } },
                  e(Text, { style: { fontFamily: F.sans, fontSize: 8, color: C.navy } }, sec),
                ),
              ),
            ),
          )
        : null,
      sectionTitle('Clientes que Confían en Nosotros'),
      e(View, { style: s.logoGrid },
        ...clientLogosData.slice(0, 12).map((cl, i) =>
          e(View, { key: i, style: s.logoCell },
            e(PDFImage, { src: cl.src, style: s.logoImg }),
            e(Text, { style: s.logoName }, cl.name),
          ),
        ),
      ),
    ),
  );

  /* ── 17. FAQ ── */
  const faqs = [
    { q: '¿Cuánto demora la implementación del servicio?', a: 'Entre 5 y 10 días hábiles desde la aprobación, dependiendo de la complejidad. Incluye selección de personal, capacitación específica, instalación tecnológica y puesta en marcha supervisada.' },
    { q: '¿Los guardias son personal propio?', a: 'Sí, 100% de nuestra dotación es contratada directamente con contrato indefinido, prestaciones completas y capacitación certificada.' },
    { q: '¿Qué pasa si un guardia falta?', a: 'Contamos con un equipo de respaldo permanente. El reemplazo se activa en menos de 2 horas sin costo adicional.' },
    { q: '¿Puedo ver el servicio en tiempo real?', a: 'Sí, a través del Portal de Clientes OPAI puede ver rondas, asistencia, incidentes y KPIs las 24 horas del día.' },
    { q: '¿Hay permanencia mínima?', a: 'Ofrecemos contratos flexibles. El período mínimo sugerido es de 12 meses para optimizar costos de implementación, pero podemos adaptar la duración a sus necesidades.' },
    { q: '¿Incluye la tecnología algún costo adicional?', a: 'No. La plataforma OPAI, apps, dispositivos GPS y toda la tecnología operacional están incluidos en el valor mensual sin costos ocultos.' },
  ];
  sections.push(
    e(View, { key: 'sec17', break: true },
      sectionTitle('Preguntas Frecuentes'),
      ...faqs.map((f, i) =>
        e(View, { key: i, style: s.faqItem },
          e(Text, { style: s.faqQ }, f.q),
          e(Text, { style: s.faqA }, f.a),
        ),
      ),
    ),
  );

  /* ── 18. Propuesta Personalizada ── */
  sections.push(
    e(View, { key: 'sec18', break: true, wrap: false },
      sectionTitle('Propuesta Personalizada'),
      ai.analisisNecesidades
        ? e(Text, { style: s.para }, ai.analisisNecesidades)
        : null,
      regimeExplanation
        ? e(View, { style: [s.cardTeal, { marginTop: 8 }] },
            e(Text, { style: s.cardTitle }, 'Régimen de turnos'),
            e(Text, { style: s.cardText }, regimeExplanation),
          )
        : null,
    ),
  );

  /* ── 19. Inversión Mensual ── */
  sections.push(
    e(View, { key: 'sec19', break: true },
      sectionTitle('Inversión Mensual'),
      e(View, { style: s.tblHeader },
        e(Text, { style: [s.tblHeaderCell, { flex: 0.5, textAlign: 'center' as const }] }, '#'),
        e(Text, { style: [s.tblHeaderCell, { flex: 3 }] }, 'ÍTEM'),
        e(Text, { style: [s.tblHeaderCell, { flex: 0.8, textAlign: 'center' as const }] }, 'CANT'),
        e(Text, { style: [s.tblHeaderCell, { flex: 1.5, textAlign: 'right' as const }] }, 'VALOR MENSUAL'),
      ),
      ...items.map((item, i) =>
        e(View, { key: i, style: s.tblRow },
          e(Text, { style: [s.tblCell, { flex: 0.5, textAlign: 'center' as const }] }, String(item.index)),
          e(Text, { style: [s.tblCell, { flex: 3 }] }, item.description),
          e(Text, { style: [s.tblCell, { flex: 0.8, textAlign: 'center' as const }] }, String(item.quantity)),
          e(Text, { style: [s.tblCellBold, { flex: 1.5, textAlign: 'right' as const }] }, item.subtotalFormatted),
        ),
      ),
      e(View, { style: s.grandTotal },
        e(Text, { style: s.grandTotalLabel }, 'TOTAL MENSUAL NETO'),
        e(Text, { style: s.grandTotalAmount }, totalNetoFormatted),
      ),
      e(Text, { style: { fontFamily: F.sans, fontSize: 7, color: C.textLighter, marginTop: 4, textAlign: 'right' as const } }, 'Valores netos. IVA se factura según ley vigente.'),
      e(View, { style: [s.cardTeal, { marginTop: 8 }] },
        e(Text, { style: s.cardTitle }, 'Condiciones de pago'),
        e(Text, { style: s.cardText }, paymentTerms),
      ),
      ...(() => {
        const includesList = includedItems && includedItems.length > 0
          ? includedItems
          : [
            'Personal seleccionado y capacitado',
            'Uniformes, equipamiento y tecnología',
            'Supervisión presencial y remota',
            'Plataforma OPAI + Portal de Clientes',
            'Reportes automáticos y soporte 24/7',
            'Reemplazos sin costo adicional',
          ];
        return [
          e(View, { style: { marginTop: 14 } },
            e(Text, { style: s.sectionSubtitle }, 'El servicio incluye'),
            ...includesList.map((txt: string, i: number) => bullet(txt, i)),
          ),
        ];
      })(),
    ),
  );

  /* ── 20. Estructura de Costos (only if breakdown exists) ── */
  if (breakdown) {
    const bd: QuoteBreakdownData = breakdown;
    const directCosts = bd.holidayAdjustment + bd.uniforms + bd.exams + bd.meals;
    const indirectCosts = bd.equipment + bd.transport + bd.vehicles + bd.infrastructure + bd.systems + (bd.other ?? 0);

    const bdRow = (label: string, value: number, indent?: boolean) =>
      e(View, { style: [s.bdRow, indent ? { paddingLeft: 16 } : null] },
        e(Text, { style: s.bdLabel }, label),
        e(Text, { style: s.bdValue }, fmtMoney(value)),
      );

    sections.push(
      e(View, { key: 'sec20', break: true },
        sectionTitle('Estructura de Costos'),

        e(View, { style: [s.bdCatHeader, { backgroundColor: '#dbeafe' }] },
          e(Text, { style: [s.tblCellBold, { flex: 3, color: '#1d4ed8' }] }, 'Mano de Obra'),
          e(Text, { style: [s.tblCellBold, { flex: 2, textAlign: 'right' as const, color: '#1d4ed8' }] }, fmtMoney(bd.totalLaborCost)),
        ),
        ...bd.positions.reduce<unknown[]>((acc, pos) => {
          acc.push(
            e(View, { key: `${pos.id}-h`, style: [s.bdRow, { backgroundColor: '#f0f9ff', paddingLeft: 12 }] },
              e(Text, { style: [s.tblCellBold, { flex: 3, fontSize: 8 }] }, `${pos.name} (${pos.totalGuardsInPosition}g)`),
              e(Text, { style: [s.tblCellBold, { flex: 2, textAlign: 'right' as const, fontSize: 8 }] }, fmtMoney(pos.totalLaborCost)),
            ),
          );
          acc.push(bdRow('Sueldo base', pos.baseSalary, true));
          if (pos.gratification > 0) acc.push(bdRow('Gratificación legal', pos.gratification, true));
          const social = pos.sisEmployer + pos.afcEmployer + pos.mutualEmployer;
          if (social > 0) acc.push(bdRow('Cargas sociales (SIS+AFC+Mutual)', social, true));
          const prov = pos.vacationProvision + pos.severanceProvision;
          if (prov > 0) acc.push(bdRow('Provisiones (vacac.+finiquito)', prov, true));
          return acc;
        }, []),

        directCosts > 0
          ? e(View, { style: { marginTop: 6 } },
              e(View, { style: [s.bdCatHeader, { backgroundColor: '#ccfbf1' }] },
                e(Text, { style: [s.tblCellBold, { flex: 3, color: '#0d9488' }] }, 'Costos Directos'),
                e(Text, { style: [s.tblCellBold, { flex: 2, textAlign: 'right' as const, color: '#0d9488' }] }, fmtMoney(directCosts)),
              ),
              bd.holidayAdjustment > 0 ? bdRow('Ajuste feriados legales', bd.holidayAdjustment, true) : null,
              bd.uniforms > 0 ? bdRow('Uniformes', bd.uniforms, true) : null,
              bd.exams > 0 ? bdRow('Exámenes médicos', bd.exams, true) : null,
              bd.meals > 0 ? bdRow('Alimentación', bd.meals, true) : null,
            )
          : null,

        indirectCosts > 0
          ? e(View, { style: { marginTop: 6 } },
              e(View, { style: [s.bdCatHeader, { backgroundColor: '#fef3c7' }] },
                e(Text, { style: [s.tblCellBold, { flex: 3, color: '#b45309' }] }, 'Costos Indirectos'),
                e(Text, { style: [s.tblCellBold, { flex: 2, textAlign: 'right' as const, color: '#b45309' }] }, fmtMoney(indirectCosts)),
              ),
              bd.equipment > 0 ? bdRow('Equipo operativo', bd.equipment, true) : null,
              bd.transport > 0 ? bdRow('Transporte', bd.transport, true) : null,
              bd.vehicles > 0 ? bdRow('Vehículos', bd.vehicles, true) : null,
              bd.infrastructure > 0 ? bdRow('Infraestructura', bd.infrastructure, true) : null,
              bd.systems > 0 ? bdRow('Sistemas', bd.systems, true) : null,
              (bd.other ?? 0) > 0 ? bdRow('Otros costos', bd.other, true) : null,
            )
          : null,

        e(View, { style: [s.bdRow, { backgroundColor: C.bgAlt, marginTop: 6 }] },
          e(Text, { style: [s.tblCellBold, { flex: 3 }] }, 'Subtotal costos base'),
          e(Text, { style: [s.tblCellBold, { flex: 2, textAlign: 'right' as const }] }, fmtMoney(bd.subtotalBase)),
        ),
        e(View, { style: [s.bdRow, { backgroundColor: '#d1fae5' }] },
          e(Text, { style: [s.tblCellBold, { flex: 3, color: '#065f46' }] }, 'Margen comercial'),
          e(Text, { style: [s.tblCellBold, { flex: 2, textAlign: 'right' as const, color: '#065f46' }] }, fmtMoney(bd.marginAmount)),
        ),
        bd.financial > 0
          ? e(View, { style: [s.bdRow, { backgroundColor: '#fff7ed' }] },
              e(Text, { style: [s.tblCellBold, { flex: 3, color: '#9a3412' }] }, 'Costo financiero'),
              e(Text, { style: [s.tblCellBold, { flex: 2, textAlign: 'right' as const, color: '#9a3412' }] }, fmtMoney(bd.financial)),
            )
          : null,
        e(View, { style: [s.grandTotal, { marginTop: 6 }] },
          e(Text, { style: s.grandTotalLabel }, 'PRECIO VENTA MENSUAL NETO'),
          e(Text, { style: s.grandTotalAmount }, fmtMoney(bd.grandTotal)),
        ),

        bd.positions.length > 0
          ? e(View, { style: { marginTop: 12 } },
              e(Text, { style: s.sectionSubtitle }, 'Valor Hora de Venta por Puesto'),
              ...bd.positions.map((pos, i) =>
                e(View, { key: i, style: s.tblRow },
                  e(Text, { style: [s.tblCell, { flex: 3 }] }, `${pos.name} (${pos.totalGuardsInPosition} guardia${pos.totalGuardsInPosition !== 1 ? 's' : ''})`),
                  e(Text, { style: [s.tblCellBold, { flex: 2, textAlign: 'right' as const, color: '#0d9488' }] }, `${fmtMoney(Math.round(pos.hourlyRateSale))}/hr`),
                ),
              ),
            )
          : null,

        e(Text, { style: { fontFamily: F.sans, fontSize: 7, color: C.textLighter, marginTop: 6, textAlign: 'right' as const } }, 'Estructura de costos con transparencia total · Valores netos'),
      ),
    );
  }

  /* ── 20b. Desglose de Equipamiento y Recursos ── */
  if (resourceBreakdown && resourceBreakdown.length > 0) {
    const directCats = resourceBreakdown.filter((c) => c.categoryType === 'direct');
    const indirectCats = resourceBreakdown.filter((c) => c.categoryType === 'indirect');
    const allCats = [...directCats, ...indirectCats];
    const totalResources = allCats.reduce((acc, c) => acc + c.subtotal, 0);
    const totalItems = allCats.reduce((acc, c) => acc + c.items.length, 0);

    const renderCatBlock = (cat: typeof allCats[number]) => {
      const isDirect = cat.categoryType === 'direct';
      const headerBg = isDirect ? '#ccfbf1' : '#fef3c7';
      const headerColor = isDirect ? '#0d9488' : '#b45309';

      return e(View, { style: { marginTop: 8 }, wrap: false },
        e(View, { style: [s.bdCatHeader, { backgroundColor: headerBg, borderRadius: 3 }] },
          e(Text, { style: [s.tblCellBold, { flex: 3, color: headerColor, fontSize: 9 }] }, cat.category),
          e(Text, { style: [s.tblCellBold, { flex: 2, textAlign: 'right' as const, color: headerColor, fontSize: 9 }] }, fmtMoney(cat.subtotal)),
        ),
        ...cat.items.map((item) =>
          e(View, { style: { paddingLeft: 12 } },
            e(View, { style: [s.bdRow, { borderBottom: `0.5 solid ${C.border}` }] },
              e(Text, { style: [s.bdLabel, { fontSize: 8 }] }, item.name),
              e(Text, { style: [s.bdValue, { fontSize: 8 }] }, fmtMoney(item.amount)),
            ),
            item.technicalSpecs
              ? e(View, { style: { paddingLeft: 10, paddingRight: 10, paddingBottom: 4, paddingTop: 1, flexDirection: 'row' as const } },
                  e(Text, { style: { fontFamily: F.sans, fontSize: 6.5, color: C.teal, marginRight: 3 } }, '\u25B8'),
                  e(Text, { style: { fontFamily: F.sans, fontSize: 7, color: C.textLight, lineHeight: 1.4, flex: 1 } }, item.technicalSpecs),
                )
              : null,
            item.unit
              ? e(View, { style: { paddingLeft: 10, paddingBottom: 2 } },
                  e(Text, { style: { fontFamily: F.sans, fontSize: 6.5, color: C.textLighter } }, item.unit),
                )
              : null,
          ),
        ),
      );
    };

    sections.push(
      e(View, { key: 'sec20b', break: true },
        sectionTitle('Desglose de Equipamiento y Recursos'),
        e(Text, { style: [s.para, { marginBottom: 8 }] },
          'A continuación se presenta el detalle de cada ítem incluido en la estructura de costos, con sus especificaciones técnicas y montos mensuales asociados.',
        ),

        e(View, { style: { backgroundColor: C.bgLight, borderRadius: 6, border: `0.5 solid ${C.border}`, padding: 8, marginBottom: 6 }, wrap: false },
          e(View, { style: { flexDirection: 'row' as const, marginBottom: 4 } },
            e(View, { style: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 } },
              e(View, { style: { width: 8, height: 8, borderRadius: 2, backgroundColor: '#ccfbf1' } }),
              e(Text, { style: { fontFamily: F.sans, fontSize: 7, color: C.textLight } }, 'Costos Directos'),
            ),
            e(View, { style: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 } },
              e(View, { style: { width: 8, height: 8, borderRadius: 2, backgroundColor: '#fef3c7' } }),
              e(Text, { style: { fontFamily: F.sans, fontSize: 7, color: C.textLight } }, 'Costos Indirectos'),
            ),
          ),
          e(Text, { style: { fontFamily: F.sans, fontSize: 7, color: C.textLighter } },
            `${allCats.length} categorías \u00B7 ${totalItems} ítems detallados`,
          ),
        ),

        ...allCats.map(renderCatBlock),

        e(View, { style: [s.grandTotal, { marginTop: 10 }], wrap: false },
          e(Text, { style: [s.grandTotalLabel, { fontSize: 10 }] }, 'TOTAL EQUIPAMIENTO Y RECURSOS'),
          e(Text, { style: [s.grandTotalAmount, { fontSize: 12 }] }, fmtMoney(totalResources)),
        ),

        e(Text, { style: { fontFamily: F.sans, fontSize: 7, color: C.textLighter, marginTop: 6, textAlign: 'right' as const } },
          'Montos mensuales \u00B7 Especificaciones sujetas a disponibilidad',
        ),
      ),
    );
  }

  /* ── 21. Implementación ── */
  const implSteps = [
    { day: 'Día 1-2', desc: 'Reunión de kick-off, relevamiento de sitio y definición de protocolos específicos.' },
    { day: 'Día 3-5', desc: 'Selección y asignación de personal. Capacitación específica sobre la instalación.' },
    { day: 'Día 5-7', desc: 'Instalación tecnológica: dispositivos GPS, app móvil, configuración OPAI.' },
    { day: 'Día 7-8', desc: 'Simulacros y pruebas operativas. Ajustes de protocolos.' },
    { day: 'Día 9-10', desc: 'Puesta en marcha supervisada. Acompañamiento ejecutivo primera semana.' },
  ];
  sections.push(
    e(View, { key: 'sec21', break: true, wrap: false },
      sectionTitle('Plan de Implementación'),
      ...implSteps.map((step, i) =>
        e(View, { key: i, style: s.stepRow },
          e(View, { style: s.stepCircle }, e(Text, { style: s.stepNum }, String(i + 1))),
          e(View, { style: s.stepContent },
            e(Text, { style: { fontFamily: F.sans, fontSize: 9, fontWeight: 700, color: C.navy } }, step.day),
            e(Text, { style: s.para }, step.desc),
          ),
        ),
      ),
      e(View, { style: [s.cardTeal, { marginTop: 8 }] },
        e(Text, { style: s.cardTitle }, 'Día 1 — Operación garantizada'),
        e(Text, { style: s.cardText }, 'Desde el primer día de servicio, su instalación contará con personal capacitado, tecnología operativa y supervisión activa. Nuestro equipo de implementación permanece en terreno durante la primera semana para asegurar una transición impecable.'),
      ),
    ),
  );

  /* ── 22. Términos + Garantía ── */
  sections.push(
    e(View, { key: 'sec22', break: true },
      sectionTitle('Términos y Garantía'),
      e(View, { style: s.twoCol },
        e(View, { style: s.col },
          e(Text, { style: s.sectionSubtitle }, 'El cliente proporciona'),
          ...['Acceso a las instalaciones para nuestro personal',
            'Espacio físico para caseta de guardia (si aplica)',
            'Información sobre protocolos internos y contactos de emergencia',
            'Estacionamiento para vehículo de supervisión (si aplica)',
          ].map((txt, i) => bullet(txt, i)),
        ),
        e(View, { style: s.col },
          e(Text, { style: s.sectionSubtitle }, 'El servicio incluye'),
          ...(() => {
            const list = includedItems && includedItems.length > 0
              ? includedItems
              : [
                'Personal seleccionado y capacitado',
                'Uniformes, equipamiento y tecnología',
                'Supervisión presencial y remota',
                'Plataforma OPAI + Portal de Clientes',
                'Reportes automáticos y soporte 24/7',
                'Reemplazos sin costo adicional',
              ];
            return list.map((txt: string, i: number) => bullet(txt, i));
          })(),
        ),
      ),
      e(View, { style: [s.cardAccent, { marginTop: 10, backgroundColor: C.highlightBg }] },
        e(Text, { style: [s.cardTitle, { color: C.accent }] }, 'Garantía de satisfacción'),
        e(Text, { style: s.cardText }, 'Si durante los primeros 30 días de servicio no cumplimos con los estándares comprometidos, el cliente puede rescindir el contrato sin penalización alguna. Nuestra confianza en el servicio es total.'),
      ),
    ),
  );

  /* ── 23. Próximos Pasos + Firmas ── */
  sections.push(
    e(View, { key: 'sec23', break: true },
      sectionTitle('Próximos Pasos'),
      ...['Revisión de esta propuesta con su equipo.',
        'Reunión de consultas y ajustes (sin compromiso).',
        'Aprobación y firma del contrato de servicio.',
        'Kick-off de implementación (5-10 días hábiles).',
        'Inicio de operaciones con supervisión dedicada.',
      ].map((txt, i) =>
        e(View, { key: i, style: s.stepRow },
          e(View, { style: s.stepCircle }, e(Text, { style: s.stepNum }, String(i + 1))),
          e(View, { style: s.stepContent }, e(Text, { style: s.para }, txt)),
        ),
      ),

      e(View, { style: s.sigArea },
        e(View, { style: s.sigBlock },
          e(View, { style: s.sigLine }),
          e(Text, { style: s.sigName }, companyConfig.commercialName),
          e(Text, { style: s.sigRole }, 'Representante Legal'),
        ),
        e(View, { style: s.sigBlock },
          e(View, { style: s.sigLine }),
          e(Text, { style: s.sigName }, contactName),
          e(Text, { style: s.sigRole }, contactPosition || 'Cliente'),
        ),
      ),

      e(View, { style: s.contactBanner },
        e(View, { style: { alignItems: 'center' as const } },
          e(Text, { style: s.contactLabel }, 'EMAIL'),
          e(Text, { style: s.contactValue }, companyConfig.email),
        ),
        e(View, { style: { alignItems: 'center' as const } },
          e(Text, { style: s.contactLabel }, 'TELÉFONO'),
          e(Text, { style: s.contactValue }, companyConfig.phone),
        ),
        companyConfig.website
          ? e(View, { style: { alignItems: 'center' as const } },
              e(Text, { style: s.contactLabel }, 'WEB'),
              e(Text, { style: s.contactValue }, companyConfig.website),
            )
          : null,
      ),
    ),
  );

  /* ═══════════════════════════════════════════
   * ASSEMBLE DOCUMENT
   * ═══════════════════════════════════════════ */

  const contentPage = e(
    Page, { key: 'content', size: 'A4', style: s.page, wrap: true },
    header,
    e(View, { style: s.body }, ...sections),
    pageFooter,
  );

  const doc = e(Document, null, coverPage, contentPage);
  const buffer = await renderToBuffer(doc);
  return Buffer.from(buffer);
}
