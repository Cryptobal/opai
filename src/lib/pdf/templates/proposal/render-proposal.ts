/**
 * Render Propuesta Técnica PDF to buffer.
 * Uses same pattern as render-quotation.ts (React.createElement, no JSX).
 */

import type { ProposalProps } from './build-proposal-props';

export async function renderProposalToBuffer(
  quotationId: string,
  tenantId: string
): Promise<Buffer> {
  const { buildProposalProps } = await import('./build-proposal-props');
  const props = await buildProposalProps(quotationId, tenantId);
  return renderProposalToBufferFromProps(props);
}

export async function renderProposalToBufferFromProps(props: ProposalProps): Promise<Buffer> {
  const nodeRequire = (await import('node:module')).createRequire(import.meta.url);
  const React = nodeRequire('react');
  const pdf = await import('@react-pdf/renderer');

  const { renderToBuffer, Document, Page, View, Text, StyleSheet, Image: PDFImage } = pdf;
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
  const C = {
    navy: '#0f172a',
    navyLight: '#1e293b',
    navyLighter: '#334155',
    teal: '#14b8a6',
    accent: '#e94560',
    slate50: '#f8fafc',
    slate200: '#e2e8f0',
    slate400: '#94a3b8',
    slate500: '#64748b',
    slate600: '#475569',
    slate700: '#334155',
    white: '#ffffff',
    success: '#22c55e',
    danger: '#ef4444',
    redLight: '#fef2f2',
    greenLight: '#f0fdf4',
    redHeader: '#dc2626',
    greenHeader: '#16a34a',
    rose50: '#fff1f2',
  };
  const F = { sans: 'PlusJakartaSans', mono: 'JetBrainsMono' };

  const s = StyleSheet.create({
    page: {
      fontFamily: F.sans,
      fontSize: 10,
      color: C.slate700,
      backgroundColor: C.white,
      paddingTop: 55,
      paddingBottom: 50,
      paddingHorizontal: 40,
    },
    coverPage: {
      fontFamily: F.sans,
      fontSize: 10,
      backgroundColor: C.navy,
      color: C.white,
      padding: 40,
      alignItems: 'center',
      justifyContent: 'flex-start',
    },
    headerBand: {
      position: 'absolute' as const,
      top: 0,
      left: 0,
      right: 0,
      height: 45,
      backgroundColor: C.navy,
      paddingHorizontal: 40,
      paddingVertical: 10,
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      borderBottomWidth: 3,
      borderBottomColor: C.accent,
    },
    headerTitle: { fontFamily: F.sans, fontSize: 10, fontWeight: 600, color: C.white },
    accentLine: { height: 2, backgroundColor: C.accent },
    sectionTitle: {
      fontFamily: F.sans,
      fontSize: 22,
      fontWeight: 700,
      color: C.navy,
      marginBottom: 4,
    },
    sectionTitleAccent: { width: 40, height: 3, backgroundColor: C.accent, marginBottom: 10 },
    bodyText: {
      fontFamily: F.sans,
      fontSize: 10,
      color: C.slate700,
      lineHeight: 1.5,
      marginBottom: 8,
    },
    highlightBox: {
      backgroundColor: C.rose50,
      borderLeftWidth: 4,
      borderLeftColor: C.accent,
      padding: 12,
      marginVertical: 10,
    },
    tblHeader: {
      flexDirection: 'row' as const,
      backgroundColor: C.navy,
      paddingVertical: 6,
      paddingHorizontal: 8,
    },
    tblHeaderCell: {
      fontFamily: F.sans,
      fontSize: 7,
      fontWeight: 700,
      color: C.white,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.3,
    },
    tblRow: {
      flexDirection: 'row' as const,
      paddingVertical: 5,
      paddingHorizontal: 8,
      borderBottomWidth: 0.5,
      borderBottomColor: C.slate200,
    },
    tblRowAlt: {
      flexDirection: 'row' as const,
      paddingVertical: 5,
      paddingHorizontal: 8,
      borderBottomWidth: 0.5,
      borderBottomColor: C.slate200,
      backgroundColor: C.slate50,
    },
    tblCell: { fontFamily: F.sans, fontSize: 9, color: C.slate700 },
    tblCellBold: { fontFamily: F.sans, fontSize: 9, fontWeight: 600, color: C.navy },
    footer: {
      position: 'absolute' as const,
      bottom: 20,
      left: 40,
      right: 40,
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      borderTopWidth: 0.5,
      borderTopColor: C.slate200,
      paddingTop: 8,
    },
    footerText: { fontFamily: F.sans, fontSize: 7, color: C.slate400 },
    metricBadge: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: C.accent,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    metricValue: { fontFamily: F.sans, fontSize: 18, fontWeight: 800, color: C.white },
    metricLabel: { fontFamily: F.sans, fontSize: 6, color: C.white, opacity: 0.9 },
    pillarCard: {
      flex: 1,
      padding: 12,
      margin: 4,
      backgroundColor: C.slate50,
      borderRadius: 4,
      borderLeftWidth: 3,
      borderLeftColor: C.accent,
    },
    bulletItem: { flexDirection: 'row' as const, marginBottom: 4, paddingLeft: 4 },
    bulletDot: { fontFamily: F.sans, fontSize: 9, color: C.accent, fontWeight: 700, marginRight: 6, width: 8 },
    bulletText: { fontFamily: F.sans, fontSize: 9, color: C.slate700, flex: 1 },
    portalPlaceholder: {
      width: 200,
      height: 120,
      backgroundColor: C.slate200,
      borderRadius: 4,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    sigBlock: { flex: 1, alignItems: 'center' as const, marginTop: 30 },
    sigLine: {
      width: '80%',
      borderBottomWidth: 1,
      borderBottomColor: C.slate700,
      marginBottom: 6,
      marginTop: 30,
    },
  });

  const {
    companyName,
    companyLogo,
    quotationCode,
    proposalDate,
    contactName,
    contactPosition,
    ai,
    serviceType,
    installationName,
    installationAddress,
    coverageSchedule,
    staffingCount,
    staffingRegime,
    supervisionFrequency,
    items,
    totalNetoFormatted,
    paymentTerms,
    gardLogo,
    companyConfig,
    companyStats,
    regimeExplanation,
  } = props;

  const proposalHeader = () =>
    e(
      View,
      { fixed: true },
      e(
        View,
        { style: s.headerBand },
        gardLogo
          ? e(PDFImage, { src: gardLogo, style: { height: 25, maxWidth: 100, objectFit: 'contain' as const } })
          : e(Text, { style: [s.headerTitle, { fontSize: 14, fontWeight: 800 }] }, 'GARD'),
        e(View, { style: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const } },
          e(Text, { style: [s.headerTitle, { fontSize: 11, fontWeight: 400 }] }, `Propuesta Técnica — ${companyName}`),
        ),
        companyLogo
          ? e(View, { style: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.white, alignItems: 'center' as const, justifyContent: 'center' as const, overflow: 'hidden' as const } },
            e(PDFImage, { src: companyLogo, style: { height: 25, maxWidth: 80, objectFit: 'contain' as const } }),
          )
          : e(View, { style: { width: 30 } }),
      ),
    );

  const proposalFooter = () =>
    e(
      View,
      { style: s.footer, fixed: true },
      e(Text, { style: s.footerText }, `Confidencial · N° ${quotationCode}`),
      e(Text, { style: s.footerText }, `${companyConfig.commercialName} · ${companyConfig.website} · ${companyConfig.phone}`),
      e(Text, {
        style: s.footerText,
        render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
          `Página ${pageNumber} de ${totalPages}`,
      }),
    );

  const sectionTitleEl = (text: string) =>
    e(View, { style: { marginBottom: 10 } },
      e(Text, { style: s.sectionTitle }, text),
      e(View, { style: s.sectionTitleAccent }),
    );
  const paragraph = (text: string) => e(Text, { style: s.bodyText }, text);
  const highlightBox = (text: string) =>
    e(View, { style: s.highlightBox }, e(Text, { style: [s.bodyText, { fontWeight: 600, color: C.navy }] }, text));
  const metricBadge = (value: string, label: string) =>
    e(View, { style: s.metricBadge }, e(Text, { style: s.metricValue }, value), e(Text, { style: s.metricLabel }, label));

  const resumenParrafos = ai.resumenEjecutivo.split(/\n\n+/).filter((p) => p.trim());

  const pages: unknown[] = [];

  pages.push(
    e(
      Page,
      { key: 'p1', size: 'A4' as const, style: [s.coverPage, { paddingLeft: 48 }] },
      e(View, { style: { position: 'absolute' as const, left: 0, top: 0, bottom: 0, width: 8, backgroundColor: C.accent } }),
      gardLogo
        ? e(PDFImage, { src: gardLogo, style: { height: 56, maxWidth: 200, objectFit: 'contain' as const, marginBottom: 12, alignSelf: 'center' as const } })
        : e(Text, { style: { fontFamily: F.sans, fontSize: 28, fontWeight: 800, letterSpacing: 2, marginBottom: 12, color: C.white, alignSelf: 'center' as const } }, 'GARD SECURITY'),
      e(View, { style: { width: 80, height: 2, backgroundColor: C.accent, alignSelf: 'center' as const, marginBottom: 16 } }),
      e(Text, { style: { fontFamily: F.sans, fontSize: 28, fontWeight: 700, color: C.white, letterSpacing: 3, textTransform: 'uppercase' as const, marginBottom: 6, alignSelf: 'center' as const } }, 'Propuesta Técnica'),
      e(Text, { style: { fontFamily: F.sans, fontSize: 14, color: C.white, opacity: 0.7, letterSpacing: 2, textTransform: 'uppercase' as const, marginBottom: 24, alignSelf: 'center' as const } }, 'De Servicio de Seguridad Integral'),
      e(Text, { style: { fontFamily: F.sans, fontSize: 36, fontWeight: 700, color: C.white, marginBottom: 8, alignSelf: 'center' as const } }, companyName),
      e(Text, { style: { fontFamily: F.sans, fontSize: 12, fontStyle: 'italic' as const, color: C.white, opacity: 0.8, textAlign: 'center' as const, maxWidth: 450, marginBottom: 24 } }, ai.descripcionBreve),
      e(View, { style: { flexDirection: 'row' as const, justifyContent: 'center' as const, alignItems: 'center' as const, gap: 16, marginBottom: 32 } },
        e(View, { style: { alignItems: 'center' as const } }, e(Text, { style: { fontFamily: F.sans, fontSize: 28, fontWeight: 800, color: C.accent } }, '67%'), e(Text, { style: { fontFamily: F.sans, fontSize: 8, color: C.white, opacity: 0.6 } }, 'Reducción incidentes')),
        e(Text, { style: { fontFamily: F.sans, fontSize: 10, color: C.white, opacity: 0.5 } }, '|'),
        e(View, { style: { alignItems: 'center' as const } }, e(Text, { style: { fontFamily: F.sans, fontSize: 28, fontWeight: 800, color: C.accent } }, '96%'), e(Text, { style: { fontFamily: F.sans, fontSize: 8, color: C.white, opacity: 0.6 } }, 'Rondas cumplidas')),
        e(Text, { style: { fontFamily: F.sans, fontSize: 10, color: C.white, opacity: 0.5 } }, '|'),
        e(View, { style: { alignItems: 'center' as const } }, e(Text, { style: { fontFamily: F.sans, fontSize: 28, fontWeight: 800, color: C.accent } }, '100%'), e(Text, { style: { fontFamily: F.sans, fontSize: 8, color: C.white, opacity: 0.6 } }, 'Documentado')),
        e(Text, { style: { fontFamily: F.sans, fontSize: 10, color: C.white, opacity: 0.5 } }, '|'),
        e(View, { style: { alignItems: 'center' as const } }, e(Text, { style: { fontFamily: F.sans, fontSize: 28, fontWeight: 800, color: C.accent } }, '94%'), e(Text, { style: { fontFamily: F.sans, fontSize: 8, color: C.white, opacity: 0.6 } }, 'Renovación')),
      ),
      e(View, { style: { position: 'absolute' as const, bottom: 40, left: 48, right: 48, flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'flex-end' as const } },
        e(View, {},
          e(Text, { style: { fontFamily: F.sans, fontSize: 9, color: C.white, opacity: 0.9 } }, `Preparada para: ${contactName}${contactPosition ? ` · ${contactPosition}` : ''}`),
          e(Text, { style: { fontFamily: F.sans, fontSize: 8, color: C.white, opacity: 0.7, marginTop: 4 } }, `${proposalDate} · N° ${quotationCode}`),
        ),
        companyLogo ? e(PDFImage, { src: companyLogo, style: { height: 36, maxWidth: 100, objectFit: 'contain' as const } }) : null,
      ),
    ),
  );

  pages.push(
    e(
      Page,
      { key: 'p2', size: 'A4' as const, style: s.page },
      proposalHeader(),
      e(View, { style: { marginTop: 20 } },
        sectionTitleEl('Resumen Ejecutivo'),
        ...resumenParrafos.map((p, i) => e(Text, { key: i, style: s.bodyText }, p)),
        e(View, { style: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 12, marginTop: 16 } },
          e(View, { style: s.highlightBox }, e(Text, { style: [s.tblHeaderCell, { color: C.slate500 }] }, 'Servicio'), e(Text, { style: s.tblCellBold }, serviceType)),
          e(View, { style: s.highlightBox }, e(Text, { style: [s.tblHeaderCell, { color: C.slate500 }] }, 'Dotación'), e(Text, { style: s.tblCellBold }, `${staffingCount} guardias · ${staffingRegime}`)),
          e(View, { style: s.highlightBox }, e(Text, { style: [s.tblHeaderCell, { color: C.slate500 }] }, 'Cobertura'), e(Text, { style: s.tblCellBold }, coverageSchedule)),
          e(View, { style: s.highlightBox }, e(Text, { style: [s.tblHeaderCell, { color: C.slate500 }] }, 'Inversión'), e(Text, { style: s.tblCellBold }, totalNetoFormatted)),
        ),
      ),
      proposalFooter(),
    ),
  );

  const gardText = 'Empresa de seguridad privada autorizada (OS-10 vigente), con operación activa en múltiples regiones de Chile. Especializada en servicios de seguridad para entornos industriales, logísticos, de salud, retail y corporativos.\n\nPero lo que nos hace diferentes no es solo nuestra gente — es cómo la gestionamos. Gard opera 100% sobre OPAI, nuestra plataforma tecnológica propietaria que convierte la seguridad en un servicio medible, trazable y transparente.';
  const lx3Text = 'OPAI es desarrollado y mantenido por LX3.ai, nuestro Software Studio especializado en aplicaciones con inteligencia artificial. LX3 forma parte del mismo holding, lo que significa que Gard no depende de proveedores externos para su tecnología: la construimos nosotros.\n\nEsto nos permite adaptar, escalar y desarrollar funcionalidades a medida para cada cliente. Si su operación necesita un módulo específico — control de acceso vehicular, gestión de visitas, integración con su ERP — lo construimos.';

  pages.push(
    e(
      Page,
      { key: 'p3', size: 'A4' as const, style: s.page },
      proposalHeader(),
      e(View, { style: { marginTop: 20 } },
        sectionTitleEl('Más que una empresa de seguridad. Un ecosistema tecnológico.'),
        e(View, { style: { flexDirection: 'row' as const, gap: 20 } },
          e(View, { style: { flex: 1 } },
            e(Text, { style: [s.bodyText, { fontWeight: 600, marginBottom: 6 }] }, 'Gard Security'),
            ...gardText.split(/\n\n+/).map((p, i) => e(Text, { key: i, style: s.bodyText }, p)),
          ),
          e(View, { style: { flex: 1 } },
            e(Text, { style: [s.bodyText, { fontWeight: 600, marginBottom: 6 }] }, 'LX3.ai'),
            ...lx3Text.split(/\n\n+/).map((p, i) => e(Text, { key: i, style: s.bodyText }, p)),
          ),
        ),
        e(Text, { style: [s.bodyText, { fontWeight: 600, marginTop: 16, marginBottom: 8 }] }, 'Gard en números:'),
        e(View, { style: { flexDirection: 'row' as const, gap: 24 } },
          e(View, { style: { alignItems: 'center' as const } }, e(Text, { style: [s.tblCellBold, { fontSize: 18, color: C.accent }] }, companyStats.yearsInOperation), e(Text, { style: [s.bodyText, { fontSize: 8, color: C.slate500 }] }, 'años de operación')),
          e(View, { style: { alignItems: 'center' as const } }, e(Text, { style: [s.tblCellBold, { fontSize: 18, color: C.accent }] }, companyStats.activeGuards), e(Text, { style: [s.bodyText, { fontSize: 8, color: C.slate500 }] }, 'guardias activos')),
          e(View, { style: { alignItems: 'center' as const } }, e(Text, { style: [s.tblCellBold, { fontSize: 18, color: C.accent }] }, companyStats.protectedFacilities), e(Text, { style: [s.bodyText, { fontSize: 8, color: C.slate500 }] }, 'instalaciones protegidas')),
          e(View, { style: { alignItems: 'center' as const } }, e(Text, { style: [s.tblCellBold, { fontSize: 18, color: C.accent }] }, companyStats.regionsCount), e(Text, { style: [s.bodyText, { fontSize: 8, color: C.slate500 }] }, 'regiones de Chile')),
        ),
      ),
      proposalFooter(),
    ),
  );

  pages.push(
    e(
      Page,
      { key: 'p3b', size: 'A4' as const, style: s.page },
      proposalHeader(),
      e(View, { style: { marginTop: 20 } },
        sectionTitleEl('Estructura corporativa Gard Security'),
        e(View, { style: { alignItems: 'center' as const, marginVertical: 12 } },
          e(View, { style: { width: '35%', backgroundColor: C.navy, padding: 10, alignItems: 'center' as const } },
            e(Text, { style: { fontFamily: F.sans, fontSize: 10, fontWeight: 700, color: C.white } }, 'GERENCIA GENERAL'),
            e(Text, { style: { fontFamily: F.sans, fontSize: 8, color: C.white, opacity: 0.9 } }, 'Dirección estratégica'),
          ),
          e(View, { style: { width: 2, height: 12, backgroundColor: C.slate400 } }),
          e(View, { style: { flexDirection: 'row' as const, gap: 8, marginTop: 8 } },
            e(View, { style: { flex: 1, backgroundColor: C.navyLight, padding: 8, alignItems: 'center' as const } },
              e(Text, { style: { fontFamily: F.sans, fontSize: 9, fontWeight: 600, color: C.white } }, 'DIRECCIÓN DE OPERACIONES'),
            ),
            e(View, { style: { flex: 1, backgroundColor: C.navyLight, padding: 8, alignItems: 'center' as const } },
              e(Text, { style: { fontFamily: F.sans, fontSize: 9, fontWeight: 600, color: C.white } }, 'DIRECCIÓN DE ADM. Y FINANZAS'),
            ),
            e(View, { style: { flex: 1, backgroundColor: C.navyLight, padding: 8, alignItems: 'center' as const } },
              e(Text, { style: { fontFamily: F.sans, fontSize: 9, fontWeight: 600, color: C.white } }, 'ASESORÍA LEGAL'),
              e(Text, { style: { fontFamily: F.sans, fontSize: 7, color: C.white, opacity: 0.8 } }, 'OS-10 · Karin · DT · Contratos'),
            ),
          ),
          e(View, { style: { flexDirection: 'row' as const, gap: 8, marginTop: 8 } },
            e(View, { style: { flex: 1, backgroundColor: C.slate50, padding: 8 } },
              e(Text, { style: [s.bodyText, { fontWeight: 600, marginBottom: 4 }] }, 'Jefe de Operaciones'),
              e(Text, { style: [s.bodyText, { fontSize: 8 }] }, 'RRHH y Selección'),
              e(Text, { style: [s.bodyText, { fontSize: 8 }] }, 'Prev. de Riesgos'),
              e(Text, { style: [s.bodyText, { fontSize: 8 }] }, 'Coord. Tecnología (OPAI/LX3)'),
            ),
            e(View, { style: { flex: 1, backgroundColor: C.slate50, padding: 8 } },
              e(Text, { style: [s.bodyText, { fontWeight: 600, marginBottom: 4 }] }, 'Jefe de Administración'),
              e(Text, { style: [s.bodyText, { fontSize: 8 }] }, 'Contabilidad y Finanzas'),
            ),
          ),
          e(View, { style: { flexDirection: 'row' as const, gap: 8, marginTop: 8 } },
            e(View, { style: { flex: 1, backgroundColor: C.rose50, padding: 8, borderLeftWidth: 3, borderLeftColor: C.accent } },
              e(Text, { style: [s.bodyText, { fontWeight: 600 }] }, 'Coordinadores de Zona'),
              e(Text, { style: [s.bodyText, { fontSize: 8 }] }, 'Supervisión regional'),
            ),
            e(View, { style: { flex: 1, backgroundColor: C.rose50, padding: 8, borderLeftWidth: 3, borderLeftColor: C.accent } },
              e(Text, { style: [s.bodyText, { fontWeight: 600 }] }, 'Supervisores'),
              e(Text, { style: [s.bodyText, { fontSize: 8 }] }, 'Verificación en terreno'),
            ),
            e(View, { style: { flex: 1, backgroundColor: C.rose50, padding: 8, borderLeftWidth: 3, borderLeftColor: C.accent } },
              e(Text, { style: [s.bodyText, { fontWeight: 600 }] }, 'Guardias'),
              e(Text, { style: [s.bodyText, { fontSize: 8 }] }, 'Ejecución del servicio'),
            ),
          ),
        ),
        sectionTitleEl('Su cadena de servicio directa'),
        e(Text, { style: [s.bodyText, { color: C.slate500, fontStyle: 'italic' as const, marginBottom: 12 }] }, 'Cada nivel tiene nombre, cargo y responsabilidad ante usted.'),
        e(View, { style: { flexDirection: 'row' as const, gap: 16 } },
          e(View, { style: { width: 24, alignItems: 'center' as const } },
            e(View, { style: { width: 20, height: 20, borderRadius: 10, backgroundColor: C.accent, alignItems: 'center' as const, justifyContent: 'center' as const } }, e(Text, { style: { fontFamily: F.sans, fontSize: 8, fontWeight: 700, color: C.white } }, '1')),
            e(View, { style: { width: 2, flex: 1, backgroundColor: C.accent, marginVertical: 4 } }),
            e(View, { style: { width: 20, height: 20, borderRadius: 10, backgroundColor: C.slate400, alignItems: 'center' as const, justifyContent: 'center' as const } }, e(Text, { style: { fontFamily: F.sans, fontSize: 8, fontWeight: 700, color: C.white } }, '2')),
            e(View, { style: { width: 2, flex: 1, backgroundColor: C.slate400, marginVertical: 4 } }),
            e(View, { style: { width: 20, height: 20, borderRadius: 10, backgroundColor: C.slate400, alignItems: 'center' as const, justifyContent: 'center' as const } }, e(Text, { style: { fontFamily: F.sans, fontSize: 8, fontWeight: 700, color: C.white } }, '3')),
            e(View, { style: { width: 2, flex: 1, backgroundColor: C.slate400, marginVertical: 4 } }),
            e(View, { style: { width: 20, height: 20, borderRadius: 10, backgroundColor: C.slate400, alignItems: 'center' as const, justifyContent: 'center' as const } }, e(Text, { style: { fontFamily: F.sans, fontSize: 8, fontWeight: 700, color: C.white } }, '4')),
            e(View, { style: { width: 2, flex: 1, backgroundColor: C.slate400, marginVertical: 4 } }),
            e(View, { style: { width: 20, height: 20, borderRadius: 10, backgroundColor: C.slate400, alignItems: 'center' as const, justifyContent: 'center' as const } }, e(Text, { style: { fontFamily: F.sans, fontSize: 8, fontWeight: 700, color: C.white } }, '5')),
            e(View, { style: { width: 2, flex: 1, backgroundColor: C.slate400, marginVertical: 4 } }),
            e(View, { style: { width: 20, height: 20, borderRadius: 10, backgroundColor: C.slate400, alignItems: 'center' as const, justifyContent: 'center' as const } }, e(Text, { style: { fontFamily: F.sans, fontSize: 8, fontWeight: 700, color: C.white } }, '6')),
          ),
          e(View, { style: { flex: 1 } },
            e(View, { style: { marginBottom: 10 } }, e(Text, { style: [s.bodyText, { fontWeight: 600, color: C.accent }] }, 'USTED'), e(Text, { style: s.bodyText }, ` (${companyName})`)),
            e(View, { style: { marginBottom: 10 } }, e(Text, { style: [s.bodyText, { fontWeight: 600 }] }, 'Ejecutivo de Cuenta'), e(Text, { style: s.bodyText }, ' — Consultas comerciales, ajustes, reuniones de gestión')),
            e(View, { style: { marginBottom: 10 } }, e(Text, { style: [s.bodyText, { fontWeight: 600 }] }, 'Coordinador de Zona'), e(Text, { style: s.bodyText }, ' — Responsable operacional de su instalación, gestión del equipo')),
            e(View, { style: { marginBottom: 10 } }, e(Text, { style: [s.bodyText, { fontWeight: 600 }] }, 'Supervisor Asignado'), e(Text, { style: s.bodyText }, ' — Verificación en terreno, mínimo 2 visitas por turno')),
            e(View, { style: { marginBottom: 10 } }, e(Text, { style: [s.bodyText, { fontWeight: 600 }] }, 'Guardias Asignados'), e(Text, { style: s.bodyText }, ' — Ejecución del servicio en su instalación')),
            e(View, { style: { marginBottom: 10 } }, e(Text, { style: [s.bodyText, { fontWeight: 600 }] }, 'Portal Cliente 24/7'), e(Text, { style: s.bodyText }, ' — Dashboard, reportes, chat, documentos')),
            e(View, { style: { marginBottom: 10 } }, e(Text, { style: [s.bodyText, { fontWeight: 600 }] }, 'Línea de Emergencia'), e(Text, { style: s.bodyText }, ' — +56 98 230 7771 — disponible 24/7')),
          ),
        ),
        highlightBox('Usted no contrata guardias. Contrata una organización completa dedicada a su seguridad.'),
      ),
      proposalFooter(),
    ),
  );

  const modulos = [
    'CRM & CPQ — Gestión comercial y cotizaciones inteligentes',
    'Gestión de Personal — Fichas, contratos, documentación al día',
    'Pauta Diaria — Asignación de turnos y asistencia en tiempo real',
    'Rondas & Checkpoints — Control NFC/QR con GPS y evidencia fotográfica',
    'Control Nocturno — Centro de comando unificado para operación nocturna',
    'Chat Operacional — Comunicación en tiempo real entre todos los niveles',
    'Incidentes & Reportes — Registro, seguimiento y reportabilidad automática',
    'Cumplimiento DT — Resolución Exenta N°38, control biométrico, GPS',
    'Finanzas — Facturación, DTE, conciliación bancaria',
    'LMS & Gamificación — Capacitación continua con Trust Score y niveles',
  ];

  pages.push(
    e(
      Page,
      { key: 'p4', size: 'A4' as const, style: s.page },
      proposalHeader(),
      e(View, { style: { marginTop: 20 } },
        sectionTitleEl('OPAI — La única plataforma integral de gestión de seguridad privada en Chile'),
        e(Text, { style: [s.bodyText, { color: C.slate500, marginBottom: 12 }] }, 'Cada guardia, cada ronda, cada incidente, cada reporte — todo en un solo sistema.'),
        paragraph('OPAI no es un software genérico adaptado a seguridad. Es una plataforma diseñada desde cero para operar empresas de seguridad privada, con más de 20 módulos en producción y 6 aplicaciones especializadas que trabajan en tiempo real.'),
        paragraph('Cuando usted contrata Gard, no recibe solo guardias. Recibe acceso a un ecosistema tecnológico que le da visibilidad total de lo que ocurre en sus instalaciones, en todo momento.'),
        e(View, { style: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8, marginTop: 12 } },
          ...modulos.map((m, i) =>
            e(View, { key: i, style: [s.bulletItem, { width: '48%' }] }, e(Text, { style: s.bulletDot }, '•'), e(Text, { style: s.bulletText }, m)),
          ),
        ),
      ),
      proposalFooter(),
    ),
  );

  const portales = [
    { name: 'Portal Clientes', desc: 'Dashboard 24/7 con reportes, rondas, cotizaciones y chat directo.' },
    { name: 'Portal Guardias', desc: 'App móvil para turnos, rondas, incidentes con foto y GPS.' },
    { name: 'Portal Supervisores', desc: 'Verificación en terreno, inspecciones y rondas aleatorias.' },
    { name: 'Portal Rondas', desc: 'Checkpoints NFC/QR con hora, GPS y evidencia fotográfica.' },
    { name: 'Portal Acceso', desc: 'Control de acceso, lectura cédula QR, OCR patentes, offline.' },
    { name: 'Portal Admin', desc: 'Centro de comando: personal, turnos, finanzas, reportes, legal.' },
  ];

  pages.push(
    e(
      Page,
      { key: 'p5', size: 'A4' as const, style: s.page },
      proposalHeader(),
      e(View, { style: { marginTop: 20 } },
        sectionTitleEl('6 portales especializados. Cada usuario ve exactamente lo que necesita.'),
        e(View, { style: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 12 } },
          ...portales.map((p, i) =>
            e(View, { key: i, style: { width: '31%' } },
              e(View, { style: [s.portalPlaceholder, { width: 150, height: 90 }] }, e(Text, { style: [s.tblHeaderCell, { color: C.slate500, fontSize: 10 }] }, p.name)),
              e(Text, { style: [s.bodyText, { fontWeight: 600, marginTop: 4 }] }, p.name),
              e(Text, { style: [s.bodyText, { fontSize: 8, marginTop: 2 }] }, p.desc),
            ),
          ),
        ),
        e(Text, { style: [s.bodyText, { fontSize: 8, color: C.slate500, marginTop: 12 }] }, 'Cada portal es una PWA instalable. Funciona en cualquier dispositivo, incluso sin conexión.'),
      ),
      proposalFooter(),
    ),
  );

  const techRows = [
    { fn: 'Portal web exclusivo', q: 'Acceso con RUT + PIN a su panel personalizado', ben: 'Ve todo sin depender de nadie' },
    { fn: 'Dashboard tiempo real', q: 'KPIs, rondas, incidentes, asistencia', ben: 'Información ejecutiva cuando la necesite' },
    { fn: 'Reportes automáticos', q: 'Diarios, semanales y mensuales', ben: 'Llegan a su correo, sin pedirlos' },
    { fn: 'Chat directo', q: 'Canal de comunicación con su equipo Gard', ben: 'Respuesta inmediata, todo trazado' },
    { fn: 'Control de rondas', q: 'Mapa con recorridos verificados', ben: 'Evidencia de que sí se están haciendo' },
    { fn: 'Registro de incidentes', q: 'Foto + GPS + timestamp + seguimiento', ben: 'Trazabilidad legal completa' },
    { fn: 'Notificaciones push', q: 'Alertas de incidentes y novedades', ben: 'Se entera primero, sin filtros' },
    { fn: 'Descarga documentos', q: 'Cotizaciones, contratos, reportes en PDF', ben: 'Todo disponible en un click' },
  ];

  pages.push(
    e(
      Page,
      { key: 'p6', size: 'A4' as const, style: s.page },
      proposalHeader(),
      e(View, { style: { marginTop: 20 } },
        sectionTitleEl('Todo esto está incluido. Sin costo adicional. Sin licencias.'),
        e(View, { style: s.tblHeader },
          e(Text, { style: [s.tblHeaderCell, { flex: 1.5 }] }, 'Funcionalidad'),
          e(Text, { style: [s.tblHeaderCell, { flex: 2 }] }, 'Qué es'),
          e(Text, { style: [s.tblHeaderCell, { flex: 2 }] }, 'Beneficio para usted'),
        ),
        ...techRows.map((r, i) =>
          e(View, { key: i, style: i % 2 === 1 ? s.tblRowAlt : s.tblRow },
            e(Text, { style: [s.tblCell, { flex: 1.5 }] }, r.fn),
            e(Text, { style: [s.tblCell, { flex: 2 }] }, r.q),
            e(Text, { style: [s.tblCell, { flex: 2 }] }, r.ben),
          ),
        ),
        highlightBox('Otros proveedores le venden el guardia y usted no sabe qué pasa. Nosotros le entregamos el control completo.'),
      ),
      proposalFooter(),
    ),
  );

  const devItems = [
    'Integración con su sistema ERP o control de acceso existente',
    'Módulo de control de acceso vehicular con OCR de patentes',
    'Gestión automatizada de visitas con pre-registro',
    'Dashboards personalizados para gerencia',
    'Alertas inteligentes basadas en patrones de riesgo con AI',
    'Aplicaciones de control específicas para su industria',
  ];

  pages.push(
    e(
      Page,
      { key: 'p7', size: 'A4' as const, style: s.page },
      proposalHeader(),
      e(View, { style: { marginTop: 20 } },
        sectionTitleEl('¿Necesita algo que no existe? Lo construimos.'),
        paragraph('Gracias a LX3.ai, nuestro Software Studio con capacidad de desarrollo full-stack e inteligencia artificial, Gard puede construir módulos y aplicaciones a medida para complementar su servicio de seguridad.'),
        paragraph('Si su operación requiere integraciones específicas, automatizaciones, o herramientas que hoy no existen en el mercado — podemos diseñarlas, desarrollarlas e integrarlas directamente en OPAI.'),
        ...devItems.map((item, i) =>
          e(View, { key: i, style: s.bulletItem }, e(Text, { style: s.bulletDot }, '•'), e(Text, { style: s.bulletText }, item)),
        ),
        highlightBox('No somos una empresa de seguridad que compró un software. Somos una empresa de seguridad que construye su propia tecnología.'),
      ),
      proposalFooter(),
    ),
  );

  const compRows = [
    { mercado: 'No sabe si el guardia llegó', gard: 'Check-in digital con GPS y hora' },
    { mercado: 'Rondas sin evidencia', gard: 'Cada checkpoint con foto + GPS + timestamp' },
    { mercado: 'Incidentes que se pierden', gard: 'Registro digital con seguimiento automático' },
    { mercado: 'Reportes manuales o inexistentes', gard: 'Reportes automáticos diarios, semanales y mensuales' },
    { mercado: 'Sin visibilidad en tiempo real', gard: 'Dashboard ejecutivo 24/7' },
    { mercado: 'Comunicación por WhatsApp', gard: 'Chat operacional trazado en OPAI' },
    { mercado: 'Documentación en papel', gard: 'Todo digital, accesible y descargable' },
    { mercado: 'Supervisión esporádica', gard: 'Mínimo 2 supervisiones por turno' },
    { mercado: 'Cumplimiento DT incierto', gard: 'Resolución Exenta N°38 implementada' },
    { mercado: 'Proveedor genérico', gard: 'Desarrollo a medida con LX3.ai' },
  ];

  pages.push(
    e(
      Page,
      { key: 'p8', size: 'A4' as const, style: s.page },
      proposalHeader(),
      e(View, { style: { marginTop: 20 } },
        sectionTitleEl('El verdadero riesgo no es la ausencia de seguridad. Es la falsa sensación de control.'),
        e(Text, { style: [s.bodyText, { color: C.slate500, marginBottom: 12 }] }, '73% de las empresas descubre fallas solo después de un incidente grave.'),
        e(View, { style: s.tblHeader },
          e(Text, { style: [s.tblHeaderCell, { flex: 2, backgroundColor: C.redHeader }] }, 'Mercado Tradicional'),
          e(Text, { style: [s.tblHeaderCell, { flex: 2, backgroundColor: C.greenHeader }] }, 'Gard + OPAI'),
        ),
        ...compRows.map((r, i) =>
          e(View, { key: i, style: { flexDirection: 'row' as const, borderBottomWidth: 0.5, borderBottomColor: C.slate200 } },
            e(View, { style: { flex: 2, backgroundColor: C.redLight, paddingVertical: 5, paddingHorizontal: 8 } }, e(Text, { style: s.tblCell }, r.mercado)),
            e(View, { style: { flex: 2, backgroundColor: C.greenLight, paddingVertical: 5, paddingHorizontal: 8 } }, e(Text, { style: s.tblCellBold }, r.gard)),
          ),
        ),
      ),
      proposalFooter(),
    ),
  );

  const niveles = [
    { label: 'Nivel 5 — Gestión', desc: 'Análisis, KPIs, mejora continua, reuniones mensuales', width: 50, bg: C.navy },
    { label: 'Nivel 4 — Reportabilidad', desc: 'Informes automáticos, dashboard ejecutivo', width: 62, bg: C.navyLight },
    { label: 'Nivel 3 — Control', desc: 'Trazabilidad digital completa vía OPAI', width: 74, bg: C.navyLighter },
    { label: 'Nivel 2 — Supervisión', desc: 'Verificación activa en terreno, mínimo 2x por turno', width: 86, bg: C.slate200 },
    { label: 'Nivel 1 — Guardia', desc: 'Presencia física profesional, selección rigurosa', width: 98, bg: C.slate50 },
  ];

  pages.push(
    e(
      Page,
      { key: 'p9', size: 'A4' as const, style: s.page },
      proposalHeader(),
      e(View, { style: { marginTop: 20 } },
        sectionTitleEl('No vendemos guardias. Implementamos un sistema de seguridad gestionado.'),
        e(View, { style: { alignItems: 'center' as const, marginVertical: 16 } },
          ...niveles.map((n, i) =>
            e(View, {
              key: i,
              style: {
                width: `${n.width}%`,
                backgroundColor: n.bg,
                padding: 10,
                marginVertical: 4,
                alignItems: 'center' as const,
              },
            }, e(Text, { style: { fontFamily: F.sans, fontSize: i < 3 ? 9 : 8, color: i < 3 ? C.white : C.slate700, fontWeight: 600 } }, `${n.label}: ${n.desc}`)),
          ),
        ),
        highlightBox('Cada capa refuerza la anterior. Ninguna funciona aislada.'),
      ),
      proposalFooter(),
    ),
  );

  const pilares = [
    { title: 'Personal Profesional', items: ['Funnel 100→12, evaluación psicológica, verificación antecedentes', 'Tasa de permanencia: 85% (industria: 50-60%)', 'Perfiles gestionados en OPAI con documentación digital'] },
    { title: 'Supervisión Permanente', items: ['Mínimo 2 supervisiones por turno, máximo 4h sin verificación', '4 niveles de supervisión con registro en OPAI', 'Rondas aleatorias de coordinadores de zona'] },
    { title: 'Control y Trazabilidad (OPAI)', items: ['Rondas NFC/QR con foto + GPS + timestamp', 'Registro digital de incidentes en tiempo real', 'Todo visible para el cliente en su Portal'] },
    { title: 'Gestión Orientada a Resultados', items: ['Dashboard ejecutivo con KPIs en tiempo real', 'Reuniones mensuales de gestión con datos de OPAI', 'Mejora continua basada en métricas'] },
  ];

  pages.push(
    e(
      Page,
      { key: 'p10', size: 'A4' as const, style: s.page },
      proposalHeader(),
      e(View, { style: { marginTop: 20 } },
        sectionTitleEl('Framework estructurado que sostiene toda nuestra operación'),
        e(View, { style: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 12 } },
          ...pilares.map((p, i) =>
            e(View, { key: i, style: [s.pillarCard, { width: '48%' }] },
              e(Text, { style: [s.tblCellBold, { marginBottom: 6, fontSize: 10 }] }, `${i + 1}. ${p.title}`),
              ...p.items.map((it, j) =>
                e(View, { key: j, style: s.bulletItem }, e(Text, { style: s.bulletDot }, '•'), e(Text, { style: [s.bulletText, { fontSize: 9 }] }, it)),
              ),
            ),
          ),
        ),
      ),
      proposalFooter(),
    ),
  );

  const slaRows = [
    { label: 'Máximo sin verificación', value: '4 horas' },
    { label: 'Supervisiones por turno', value: 'Mínimo 2' },
    { label: 'Respuesta a incidentes', value: '< 15 minutos' },
    { label: 'Cobertura de turnos', value: '99,5%' },
    { label: 'Reemplazo por ausencias', value: '< 2 horas' },
    { label: 'Documentación ante DT', value: '< 24 horas' },
  ];

  const escalamientoSteps = [
    { time: 'Inmediato', action: 'Guardia registra en OPAI (foto + GPS + descripción)' },
    { time: '≤5 min', action: 'Supervisor notificado automáticamente' },
    { time: '≤15 min', action: 'Coordinador de zona activado + Cliente notificado' },
    { time: 'Si crítico', action: 'Director de Operaciones informado' },
    { time: 'Si mayor', action: 'Gerencia General + Plan de contingencia' },
  ];

  pages.push(
    e(
      Page,
      { key: 'p11', size: 'A4' as const, style: s.page },
      proposalHeader(),
      e(View, { style: { marginTop: 20 } },
        sectionTitleEl('Usted se entera de TODO, PRIMERO. Sin filtros, sin demoras.'),
        e(View, { style: { flexDirection: 'row' as const, gap: 16, marginBottom: 16 } },
          e(View, { style: s.pillarCard }, e(Text, { style: [s.tblCellBold, { marginBottom: 4 }] }, '1. Detección'), e(Text, { style: [s.bodyText, { fontSize: 8 }] }, 'Inmediato: Identificación del evento')),
          e(View, { style: s.pillarCard }, e(Text, { style: [s.tblCellBold, { marginBottom: 4 }] }, '2. Reporte'), e(Text, { style: [s.bodyText, { fontSize: 8 }] }, '≤15 minutos: Notificación al cliente')),
          e(View, { style: s.pillarCard }, e(Text, { style: [s.tblCellBold, { marginBottom: 4 }] }, '3. Acción'), e(Text, { style: [s.bodyText, { fontSize: 8 }] }, '≤2 horas: Respuesta coordinada')),
        ),
        e(Text, { style: [s.bodyText, { fontWeight: 600, marginBottom: 8 }] }, 'Compromisos SLA:'),
        ...slaRows.map((r, i) =>
          e(View, { key: i, style: i % 2 === 1 ? s.tblRowAlt : s.tblRow },
            e(Text, { style: [s.tblCell, { flex: 2 }] }, r.label),
            e(Text, { style: [s.tblCellBold, { flex: 1 }] }, r.value),
          ),
        ),
        sectionTitleEl('Protocolo de escalamiento'),
        e(Text, { style: [s.bodyText, { fontSize: 8, marginBottom: 8 }] }, 'Evento/Incidente detectado'),
        ...escalamientoSteps.map((st, i) =>
          e(View, { key: i, style: { flexDirection: 'row' as const, marginBottom: 6 } },
            e(View, { style: { width: 60, borderLeftWidth: 3, borderLeftColor: C.accent, paddingLeft: 8 } }, e(Text, { style: [s.bodyText, { fontSize: 8, fontWeight: 600 }] }, st.time)),
            e(Text, { style: [s.bodyText, { fontSize: 8, flex: 1 }] }, st.action),
          ),
        ),
      ),
      proposalFooter(),
    ),
  );

  const reportes = [
    { tipo: 'Reporte Diario', freq: 'Todos los días', items: ['Novedades del turno', 'Incidentes registrados', 'Rondas completadas', 'Personal en servicio'] },
    { tipo: 'Reporte Semanal', freq: 'Cada semana', items: ['Tendencias de incidentes', 'KPIs operativos', 'Observaciones de supervisión', 'Recomendaciones'] },
    { tipo: 'Dashboard Ejecutivo Mensual', freq: 'Mensual', items: ['Análisis de resultados', 'Cumplimiento de SLAs', 'Estadísticas comparativas', 'Plan de mejora'] },
  ];

  pages.push(
    e(
      Page,
      { key: 'p12', size: 'A4' as const, style: s.page },
      proposalHeader(),
      e(View, { style: { marginTop: 20 } },
        sectionTitleEl('Información cuando la necesitas'),
        e(View, { style: { flexDirection: 'row' as const, gap: 12 } },
          ...reportes.map((r, i) =>
            e(View, { key: i, style: s.pillarCard },
              e(Text, { style: [s.tblCellBold, { marginBottom: 4 }] }, r.tipo),
              e(Text, { style: [s.bodyText, { fontSize: 8, marginBottom: 6 }] }, r.freq),
              ...r.items.map((it, j) =>
                e(View, { key: j, style: s.bulletItem }, e(Text, { style: s.bulletDot }, '•'), e(Text, { style: s.bulletText }, it)),
              ),
            ),
          ),
        ),
        highlightBox('Acceso web 24/7 a tu dashboard personalizado. Incluido en el servicio.'),
      ),
      proposalFooter(),
    ),
  );

  const certItems = ['OS-10 vigente y verificable', 'Resolución Exenta N°38 implementada en OPAI', 'Ley Karin — Canal de denuncias activo', 'Código de Ética y Anticorrupción', 'Control biométrico facial + GPS según Art. 19'];
  const screenItems = ['Verificación antecedentes penales', 'Evaluación psicológica', 'Examen de salud ocupacional', 'Referencias laborales verificadas'];
  const seguroItems = ['Responsabilidad civil contra terceros', 'Seguros de accidentes laborales (mutual)', 'Fidelidad funcionaria (protección ante actos deshonestos del personal)', 'Póliza todo riesgo operacional', 'Documentación disponible para auditoría en menos de 24 horas'];

  pages.push(
    e(
      Page,
      { key: 'p13', size: 'A4' as const, style: s.page },
      proposalHeader(),
      e(View, { style: { marginTop: 20 } },
        sectionTitleEl('Tranquilidad operativa, legal y financiera'),
        e(Text, { style: [s.bodyText, { fontWeight: 600, marginBottom: 6 }] }, 'Certificaciones:'),
        ...certItems.map((it, i) => e(View, { key: i, style: s.bulletItem }, e(Text, { style: s.bulletDot }, '✓'), e(Text, { style: s.bulletText }, it)),
        ),
        e(Text, { style: [s.bodyText, { fontWeight: 600, marginTop: 12, marginBottom: 6 }] }, 'Screening de personal:'),
        ...screenItems.map((it, i) => e(View, { key: i, style: s.bulletItem }, e(Text, { style: s.bulletDot }, '✓'), e(Text, { style: s.bulletText }, it)),
        ),
        e(Text, { style: [s.bodyText, { fontWeight: 600, marginTop: 12, marginBottom: 6 }] }, 'Cobertura de seguros:'),
        ...seguroItems.map((it, i) => e(View, { key: i, style: s.bulletItem }, e(Text, { style: s.bulletDot }, '•'), e(Text, { style: s.bulletText }, it)),
        ),
        highlightBox('Si la Dirección del Trabajo solicita documentación, la tendrá en su email en menos de 24 horas hábiles.'),
      ),
      proposalFooter(),
    ),
  );

  const contRows = [
    { escenario: 'Ausencia programada', respuesta: 'Reemplazo coordinado con 48h de anticipación' },
    { escenario: 'Ausencia imprevista', respuesta: 'Cobertura en máximo 2 horas' },
    { escenario: 'Contingencia mayor', respuesta: 'Plan activado inmediatamente' },
    { escenario: 'Aumento de demanda', respuesta: 'Refuerzo disponible con 24h de aviso' },
  ];

  pages.push(
    e(
      Page,
      { key: 'p14', size: 'A4' as const, style: s.page },
      proposalHeader(),
      e(View, { style: { marginTop: 20 } },
        sectionTitleEl('Planes de contingencia para cualquier escenario'),
        e(View, { style: s.tblHeader },
          e(Text, { style: [s.tblHeaderCell, { flex: 2 }] }, 'Escenario'),
          e(Text, { style: [s.tblHeaderCell, { flex: 3 }] }, 'Respuesta'),
        ),
        ...contRows.map((r, i) =>
          e(View, { key: i, style: i % 2 === 1 ? s.tblRowAlt : s.tblRow },
            e(Text, { style: [s.tblCell, { flex: 2 }] }, r.escenario),
            e(Text, { style: [s.tblCell, { flex: 3 }] }, r.respuesta),
          ),
        ),
        e(View, { style: { alignItems: 'center' as const, marginTop: 20 } }, metricBadge('99,5%', 'Cumplimiento turnos')),
      ),
      proposalFooter(),
    ),
  );

  const metricas = [
    { v: '67%', l: 'Reducción incidentes' },
    { v: '96%', l: 'Cumplimiento rondas' },
    { v: '4.7/5', l: 'Satisfacción' },
    { v: '94%', l: 'Renovación' },
  ];

  const clientNames = 'Polpaico · International Paper · Tritec · Sparta · Tattersall · Transmat · BBosch · Embajada de Brasil · GL Events · y más';

  pages.push(
    e(
      Page,
      { key: 'p15', size: 'A4' as const, style: s.page },
      proposalHeader(),
      e(View, { style: { marginTop: 20 } },
        sectionTitleEl('Resultados con clientes reales'),
        e(View, { style: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 16, marginBottom: 16 } },
          ...metricas.map((m, i) => e(View, { key: i }, metricBadge(m.v, m.l))),
        ),
        e(Text, { style: [s.bodyText, { fontWeight: 600, marginBottom: 6 }] }, 'Sectores con experiencia:'),
        e(View, { style: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6 } },
          ...ai.sectoresRelevantes.map((sec, i) =>
            e(View, { key: i, style: { backgroundColor: C.slate200, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 } },
              e(Text, { style: [s.tblCell, { fontSize: 8 }] }, sec),
            ),
          ),
        ),
        e(Text, { style: [s.bodyText, { fontWeight: 600, marginTop: 12, marginBottom: 6 }] }, 'Clientes que confían en Gard:'),
        e(Text, { style: [s.bodyText, { fontSize: 9, color: C.slate500 }] }, clientNames),
        e(Text, { style: [s.bodyText, { fontSize: 8, color: C.slate500, marginTop: 12 }] }, 'Referencias disponibles bajo solicitud y NDA.'),
      ),
      proposalFooter(),
    ),
  );

  const faqItems = [
    { q: '¿Qué pasa si un guardia no se presenta?', a: 'Cobertura garantizada en menos de 2 horas. Nuestro régimen de turnos y dotación de reemplazo asegura que su instalación nunca quede descubierta.' },
    { q: '¿Cómo sé que las rondas se están haciendo?', a: 'Verificable en tiempo real desde su Portal. Cada checkpoint se registra con hora, GPS y fotografía. Si una ronda no se cumple, el sistema genera alerta automática.' },
    { q: '¿Qué pasa si necesito más guardias un día puntual?', a: 'Refuerzo disponible con 24 horas de aviso previo. Para eventos planificados, coordinamos dotación adicional según sus necesidades.' },
    { q: '¿Puedo cambiar horarios o dotación?', a: 'Sí, con coordinación previa de 72 horas. La flexibilidad operativa es parte de nuestro servicio.' },
    { q: '¿Qué pasa si hoy tengo otro proveedor?', a: 'Gestionamos la transición completa. Realizamos inducción específica de su instalación, relevamos protocolos existentes y garantizamos que el cambio sea imperceptible para su operación.' },
    { q: '¿Cómo me aseguro de que Gard cumple lo que promete?', a: 'Pida a su proveedor actual un reporte de rondas de ayer. Si no puede entregárselo en 5 minutos, ahí está la diferencia. Nosotros se lo mostramos en tiempo real desde su Portal.' },
    { q: '¿Qué incluye la inversión mensual?', a: 'Todo: personal, supervisión, tecnología (Portal, dashboard, app), reportes, equipamiento (celulares, radios, linternas, uniformes), seguros y cumplimiento legal. Sin costos ocultos ni licencias adicionales.' },
    { q: '¿Y si no quedo conforme?', a: 'Ofrecemos un período de evaluación durante los primeros 30 días. Si el servicio no cumple sus expectativas, puede desvincularse sin penalidad.' },
  ];

  pages.push(
    e(
      Page,
      { key: 'p15b', size: 'A4' as const, style: s.page },
      proposalHeader(),
      e(View, { style: { marginTop: 20 } },
        sectionTitleEl('Preguntas frecuentes'),
        ...faqItems.map((faq, i) =>
          e(View, { key: i, style: { marginBottom: 12, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: C.slate200 } },
            e(Text, { style: [s.bodyText, { fontWeight: 600, marginBottom: 4 }] }, faq.q),
            e(Text, { style: s.bodyText }, faq.a),
          ),
        ),
      ),
      proposalFooter(),
    ),
  );

  const propRows = [
    { label: 'Tipo de servicio', value: serviceType },
    { label: 'Instalación', value: `${installationName} · ${installationAddress}` },
    { label: 'Cobertura', value: coverageSchedule },
    { label: 'Dotación', value: `${staffingCount} guardias régimen ${staffingRegime}` },
    { label: 'Supervisión', value: supervisionFrequency },
    { label: 'Equipamiento incluido', value: 'Celulares, radios, linternas, uniformes' },
    { label: 'Tecnología incluida', value: 'Portal web, dashboard, control rondas, chat' },
  ];

  pages.push(
    e(
      Page,
      { key: 'p16', size: 'A4' as const, style: s.page },
      proposalHeader(),
      e(View, { style: { marginTop: 20 } },
        sectionTitleEl(`Propuesta de servicio para ${companyName}`),
        ...ai.analisisNecesidades.split(/\n\n+/).map((p, i) => e(Text, { key: i, style: s.bodyText }, p)),
        e(View, { style: { marginTop: 12 } },
          ...propRows.map((r, i) =>
            e(View, { key: i, style: i % 2 === 1 ? s.tblRowAlt : s.tblRow },
              e(Text, { style: [s.tblCell, { flex: 2 }] }, r.label),
              e(Text, { style: [s.tblCellBold, { flex: 3 }] }, r.value),
            ),
          ),
        ),
        regimeExplanation ? highlightBox(regimeExplanation) : null,
      ),
      proposalFooter(),
    ),
  );

  pages.push(
    e(
      Page,
      { key: 'p17', size: 'A4' as const, style: s.page },
      proposalHeader(),
      e(View, { style: { marginTop: 20 } },
        sectionTitleEl('Inversión Mensual'),
        e(View, { style: s.tblHeader },
          e(Text, { style: [s.tblHeaderCell, { flex: 0.5 }] }, '#'),
          e(Text, { style: [s.tblHeaderCell, { flex: 2.5 }] }, 'Descripción'),
          e(Text, { style: [s.tblHeaderCell, { flex: 0.6 }] }, 'Cant.'),
          e(Text, { style: [s.tblHeaderCell, { flex: 1.2 }] }, 'P. Unitario'),
          e(Text, { style: [s.tblHeaderCell, { flex: 1.2 }] }, 'Subtotal'),
        ),
        ...items.map((it, i) =>
          e(View, { key: i, style: i % 2 === 1 ? s.tblRowAlt : s.tblRow },
            e(Text, { style: [s.tblCell, { flex: 0.5 }] }, String(it.index)),
            e(Text, { style: [s.tblCell, { flex: 2.5 }] }, it.description),
            e(Text, { style: [s.tblCell, { flex: 0.6 }] }, String(it.quantity)),
            e(Text, { style: [s.tblCell, { flex: 1.2 }] }, it.unitPriceFormatted),
            e(Text, { style: [s.tblCellBold, { flex: 1.2 }] }, it.subtotalFormatted),
          ),
        ),
        e(View, { style: [s.tblHeader, { backgroundColor: C.navy }] },
          e(Text, { style: [s.tblHeaderCell, { flex: 4.8 }] }, 'TOTAL NETO'),
          e(Text, { style: [s.tblHeaderCell, { flex: 1.2, color: C.teal }] }, totalNetoFormatted),
        ),
        e(Text, { style: [s.bodyText, { fontSize: 8, marginTop: 8 }] }, 'Valores netos. IVA se factura según ley.'),
        e(Text, { style: [s.bodyText, { fontSize: 9, marginTop: 4 }] }, `Forma de pago: ${paymentTerms}`),
        ...items.filter((it) => it.specifications).map((it, i) =>
          e(View, { key: i, style: { marginTop: 8 } },
            e(Text, { style: [s.tblCellBold, { fontSize: 8 }] }, it.description),
            e(Text, { style: [s.bodyText, { fontSize: 8 }] }, it.specifications),
          ),
        ),
      ),
      proposalFooter(),
    ),
  );

  const implSteps = [
    { n: 1, title: 'Visita técnica + diagnóstico', desc: 'Levantamiento de necesidades' },
    { n: 2, title: 'Propuesta + contrato', desc: 'Aprobación y firma' },
    { n: 3, title: 'Reclutamiento + implementación', desc: 'Selección y capacitación' },
    { n: 4, title: 'Inicio operación + seguimiento', desc: 'Go-live con supervisión intensiva' },
  ];

  pages.push(
    e(
      Page,
      { key: 'p18', size: 'A4' as const, style: s.page },
      proposalHeader(),
      e(View, { style: { marginTop: 20 } },
        sectionTitleEl('De la firma al servicio operativo en ≤15 días'),
        e(Text, { style: [s.bodyText, { fontWeight: 600, marginBottom: 6 }] }, '¿Viene de otro proveedor? Transición sin interrupciones.'),
        e(Text, { style: [s.bodyText, { marginBottom: 16 }] }, 'Si hoy trabaja con otra empresa de seguridad, Gard gestiona la transición completa. Relevamos planos, puntos críticos, protocolos existentes y realizamos inducción específica de su instalación antes del día 1. El cambio es imperceptible para su operación.'),
        e(View, { style: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 12 } },
          ...implSteps.map((st, i) =>
            e(View, { key: i, style: s.pillarCard },
              e(Text, { style: [s.tblCellBold, { marginBottom: 4 }] }, `${st.n}. ${st.title}`),
              e(Text, { style: s.bodyText }, st.desc),
            ),
          ),
        ),
        e(Text, { style: [s.bodyText, { fontWeight: 600, marginTop: 16, marginBottom: 6 }] }, 'Qué ocurre el Día 1'),
        e(Text, { style: s.bodyText }, 'Presencia de supervisor durante el primer turno completo. Verificación de todos los sistemas: checkpoints NFC instalados, app configurada, portal activado con sus credenciales. Usted recibe su primer reporte antes de cumplirse 24 horas de operación.'),
      ),
      proposalFooter(),
    ),
  );

  const clienteProvee = ['Caseta o espacio físico para guardia', 'Acceso a agua potable y baños', 'Lockers o espacio para pertenencias', 'Iluminación adecuada'];
  const servicioIncluye = ['Celulares corporativos, radios, linternas', 'Uniformes y credenciales', 'Reportes digitales', 'Supervisión 24/7', 'Control remoto de rondas', 'Seguros y cumplimiento legal'];

  pages.push(
    e(
      Page,
      { key: 'p19', size: 'A4' as const, style: s.page },
      proposalHeader(),
      e(View, { style: { marginTop: 20 } },
        sectionTitleEl('Transparencia en qué necesitamos y qué incluimos'),
        e(View, { style: { flexDirection: 'row' as const, gap: 24 } },
          e(View, { style: { flex: 1 } },
            e(Text, { style: [s.bodyText, { fontWeight: 600, marginBottom: 8 }] }, 'El cliente debe proveer:'),
            ...clienteProvee.map((it, i) => e(View, { key: i, style: s.bulletItem }, e(Text, { style: s.bulletDot }, '•'), e(Text, { style: s.bulletText }, it)),
            ),
          ),
          e(View, { style: { flex: 1 } },
            e(Text, { style: [s.bodyText, { fontWeight: 600, marginBottom: 8 }] }, 'El servicio incluye:'),
            ...servicioIncluye.map((it, i) => e(View, { key: i, style: s.bulletItem }, e(Text, { style: s.bulletDot }, '•'), e(Text, { style: s.bulletText }, it)),
            ),
          ),
        ),
        highlightBox('Garantía Gard: Si durante los primeros 30 días de operación el servicio no cumple con los estándares comprometidos en esta propuesta, puede desvincularse sin penalidad. Así de seguros estamos de nuestro nivel de servicio.'),
      ),
      proposalFooter(),
    ),
  );

  const ctaSteps = ['Agendar visita técnica sin costo', 'Revisar y ajustar propuesta si es necesario', 'Firma de contrato', 'Servicio activo en ≤15 días'];

  pages.push(
    e(
      Page,
      { key: 'p20', size: 'A4' as const, style: s.page },
      proposalHeader(),
      e(View, { style: { marginTop: 20 } },
        sectionTitleEl('Próximos pasos'),
        ...ctaSteps.map((step, i) => e(View, { key: i, style: s.bulletItem }, e(Text, { style: s.bulletDot }, `${i + 1}.`), e(Text, { style: s.bulletText }, step)),
        ),
        e(Text, { style: [s.bodyText, { fontWeight: 600, marginTop: 16, marginBottom: 8 }] }, '¿Tiene dudas? Conversemos:'),
        e(Text, { style: s.bodyText }, `WhatsApp: +56 98 230 7771 · Email: ${companyConfig.email} · Web: ${companyConfig.website}`),
        sectionTitleEl('Aceptación de Propuesta'),
        e(View, { style: { flexDirection: 'row' as const, gap: 40 } },
          e(View, { style: s.sigBlock },
            e(Text, { style: [s.bodyText, { fontWeight: 600, marginBottom: 4 }] }, 'Por Gard Security:'),
            e(View, { style: s.sigLine }),
            e(Text, { style: [s.bodyText, { fontSize: 8 }] }, 'Nombre: ____________________'),
            e(Text, { style: [s.bodyText, { fontSize: 8 }] }, 'Cargo: Gerente Comercial'),
            e(Text, { style: [s.bodyText, { fontSize: 8 }] }, 'Firma: ____________________'),
            e(Text, { style: [s.bodyText, { fontSize: 8 }] }, 'Fecha: ____________________'),
          ),
          e(View, { style: s.sigBlock },
            e(Text, { style: [s.bodyText, { fontWeight: 600, marginBottom: 4 }] }, `Por ${companyName}:`),
            e(View, { style: s.sigLine }),
            e(Text, { style: [s.bodyText, { fontSize: 8 }] }, `Nombre: ${contactName}`),
            e(Text, { style: [s.bodyText, { fontSize: 8 }] }, `Cargo: ${contactPosition || '____________________'}`),
            e(Text, { style: [s.bodyText, { fontSize: 8 }] }, 'Firma: ____________________'),
            e(Text, { style: [s.bodyText, { fontSize: 8 }] }, 'Fecha: ____________________'),
          ),
        ),
        e(Text, { style: [s.bodyText, { fontSize: 8, marginTop: 24, textAlign: 'center' as const }] }, 'Esta propuesta tiene una validez de 30 días desde su fecha de emisión.'),
        e(Text, { style: [s.bodyText, { fontSize: 7, marginTop: 12, textAlign: 'center' as const, color: C.slate500 }] }, 'Propuesta generada por OPAI — Plataforma desarrollada por LX3.ai'),
      ),
      proposalFooter(),
    ),
  );

  const doc = e(Document, null, ...pages);
  const buffer = await renderToBuffer(doc);
  return Buffer.from(buffer);
}
