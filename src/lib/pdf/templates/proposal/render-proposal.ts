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
    teal: '#14b8a6',
    accent: '#e94560',
    slate50: '#f8fafc',
    slate200: '#e2e8f0',
    slate400: '#94a3b8',
    slate500: '#64748b',
    slate700: '#334155',
    white: '#ffffff',
    success: '#22c55e',
    danger: '#ef4444',
  };
  const F = { sans: 'PlusJakartaSans', mono: 'JetBrainsMono' };

  const s = StyleSheet.create({
    page: {
      fontFamily: F.sans,
      fontSize: 9,
      color: C.slate700,
      backgroundColor: C.white,
      paddingTop: 50,
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
      backgroundColor: C.navy,
      paddingHorizontal: 40,
      paddingVertical: 12,
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
    },
    headerTitle: { fontFamily: F.sans, fontSize: 10, fontWeight: 600, color: C.white },
    accentLine: { height: 2, backgroundColor: C.accent },
    sectionTitle: {
      fontFamily: F.sans,
      fontSize: 12,
      fontWeight: 700,
      color: C.navy,
      marginBottom: 10,
      paddingBottom: 4,
      borderBottomWidth: 2,
      borderBottomColor: C.accent,
    },
    bodyText: {
      fontFamily: F.sans,
      fontSize: 9,
      color: C.slate700,
      lineHeight: 1.5,
      marginBottom: 8,
    },
    highlightBox: {
      backgroundColor: C.slate50,
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
  } = props;

  const proposalHeader = () =>
    e(
      View,
      { fixed: true },
      e(
        View,
        { style: s.headerBand },
        e(View, { style: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 } },
          gardLogo
            ? e(PDFImage, { src: gardLogo, style: { height: 24, maxWidth: 100, objectFit: 'contain' as const } })
            : e(Text, { style: [s.headerTitle, { fontSize: 14, fontWeight: 800 }] }, 'GARD'),
        ),
        e(Text, { style: s.headerTitle }, `Propuesta Técnica — ${companyName}`),
        companyLogo
          ? e(PDFImage, { src: companyLogo, style: { height: 24, maxWidth: 80, objectFit: 'contain' as const } })
          : null,
      ),
      e(View, { style: s.accentLine }),
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

  const sectionTitleEl = (text: string) => e(Text, { style: s.sectionTitle }, text);
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
      { key: 'p1', size: 'A4' as const, style: s.coverPage },
      gardLogo
        ? e(PDFImage, { src: gardLogo, style: { height: 48, maxWidth: 180, objectFit: 'contain' as const, marginBottom: 30 } })
        : e(Text, { style: { fontSize: 28, fontWeight: 800, letterSpacing: 2, marginBottom: 30 } }, 'GARD SECURITY'),
      e(Text, { style: { fontSize: 14, fontWeight: 600, marginBottom: 8, opacity: 0.9 } }, 'Propuesta Técnica'),
      e(Text, { style: { fontSize: 20, fontWeight: 700, marginBottom: 20 } }, companyName),
      e(Text, { style: { fontSize: 10, marginBottom: 30, textAlign: 'center' as const, maxWidth: 400 } }, ai.descripcionBreve),
      e(View, { style: { flexDirection: 'row' as const, gap: 20, marginTop: 20 } },
        metricBadge(String(staffingCount), 'Guardias'),
        metricBadge(totalNetoFormatted.split(' ')[0]?.slice(0, 8) || '-', 'Inversión'),
      ),
      e(Text, { style: { fontSize: 9, marginTop: 40 } }, `Para: ${contactName}${contactPosition ? `, ${contactPosition}` : ''}`),
      e(Text, { style: { fontSize: 8, marginTop: 4, opacity: 0.8 } }, `${proposalDate} · ${quotationCode}`),
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
    { name: 'Portal Clientes', desc: 'Acceso web exclusivo. Vea estado del servicio, reportes, rondas, cotizaciones. Disponible 24/7.' },
    { name: 'Portal Guardias', desc: 'App móvil (PWA) para registrar turnos, marcar rondas, reportar incidentes con foto y GPS.' },
    { name: 'Portal Supervisores', desc: 'Herramienta de terreno. Verificación de personal, inspecciones, rondas aleatorias.' },
    { name: 'Portal Rondas', desc: 'Checkpoints NFC/QR. El guardia marca cada punto con hora, GPS y foto.' },
    { name: 'Portal Acceso', desc: 'Control de acceso. Lectura cédula chilena, OCR patentes, registro de visitas.' },
    { name: 'Portal Admin (OPAI)', desc: 'Centro de comando. Gestión de personal, turnos, finanzas, incidentes — todo integrado.' },
  ];

  pages.push(
    e(
      Page,
      { key: 'p5', size: 'A4' as const, style: s.page },
      proposalHeader(),
      e(View, { style: { marginTop: 20 } },
        sectionTitleEl('6 portales especializados. Cada usuario ve exactamente lo que necesita.'),
        ...portales.map((p, i) =>
          e(View, { key: i, style: { flexDirection: 'row' as const, marginBottom: 16, gap: 12 } },
            e(View, { style: s.portalPlaceholder }, e(Text, { style: [s.tblHeaderCell, { color: C.slate500 }] }, p.name)),
            e(View, { style: { flex: 1 } }, e(Text, { style: [s.bodyText, { fontWeight: 600 }] }, p.name), e(Text, { style: s.bodyText }, p.desc)),
          ),
        ),
        e(Text, { style: [s.bodyText, { fontSize: 8, color: C.slate500, marginTop: 8 }] }, 'Cada portal es una PWA instalable. Funciona en cualquier dispositivo, incluso sin conexión.'),
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
          e(Text, { style: [s.tblHeaderCell, { flex: 2, backgroundColor: C.danger }] }, 'Mercado Tradicional'),
          e(Text, { style: [s.tblHeaderCell, { flex: 2, backgroundColor: C.success }] }, 'Gard + OPAI'),
        ),
        ...compRows.map((r, i) =>
          e(View, { key: i, style: i % 2 === 1 ? s.tblRowAlt : s.tblRow },
            e(Text, { style: [s.tblCell, { flex: 2, color: C.slate600 }] }, r.mercado),
            e(Text, { style: [s.tblCellBold, { flex: 2, color: C.teal }] }, r.gard),
          ),
        ),
      ),
      proposalFooter(),
    ),
  );

  const niveles = [
    'Nivel 5 — Gestión: Análisis, KPIs, mejora continua, reuniones mensuales',
    'Nivel 4 — Reportabilidad: Informes automáticos, dashboard ejecutivo',
    'Nivel 3 — Control: Trazabilidad digital completa vía OPAI',
    'Nivel 2 — Supervisión: Verificación activa en terreno, mínimo 2x por turno',
    'Nivel 1 — Guardia: Presencia física profesional, selección rigurosa',
  ];

  pages.push(
    e(
      Page,
      { key: 'p9', size: 'A4' as const, style: s.page },
      proposalHeader(),
      e(View, { style: { marginTop: 20 } },
        sectionTitleEl('No vendemos guardias. Implementamos un sistema de seguridad gestionado.'),
        e(View, { style: { alignItems: 'center' as const, marginVertical: 20 } },
          ...niveles.map((n, i) =>
            e(View, {
              key: i,
              style: {
                width: `${60 + (niveles.length - i) * 15}%`,
                backgroundColor: C.navyLight,
                padding: 8,
                marginVertical: 2,
                borderRadius: 2,
              },
            }, e(Text, { style: { fontFamily: F.sans, fontSize: 8, color: C.white, fontWeight: 600 } }, n)),
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
        e(View, { style: { flexDirection: 'row' as const, flexWrap: 'wrap' as const } },
          ...pilares.map((p, i) =>
            e(View, { key: i, style: s.pillarCard },
              e(Text, { style: [s.tblCellBold, { marginBottom: 6 }] }, `${i + 1}. ${p.title}`),
              ...p.items.map((it, j) =>
                e(View, { key: j, style: s.bulletItem }, e(Text, { style: s.bulletDot }, '•'), e(Text, { style: s.bulletText }, it)),
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

  pages.push(
    e(
      Page,
      { key: 'p11', size: 'A4' as const, style: s.page },
      proposalHeader(),
      e(View, { style: { marginTop: 20 } },
        sectionTitleEl('Usted se entera de TODO, PRIMERO. Sin filtros, sin demoras.'),
        e(View, { style: { flexDirection: 'row' as const, gap: 16, marginBottom: 20 } },
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
        e(Text, { style: [s.bodyText, { fontSize: 8, color: C.slate500, marginTop: 12 }] }, 'Referencias disponibles bajo solicitud y NDA.'),
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
        e(View, { style: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 12 } },
          ...implSteps.map((st, i) =>
            e(View, { key: i, style: s.pillarCard },
              e(Text, { style: [s.tblCellBold, { marginBottom: 4 }] }, `${st.n}. ${st.title}`),
              e(Text, { style: s.bodyText }, st.desc),
            ),
          ),
        ),
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
      ),
      proposalFooter(),
    ),
  );

  pages.push(
    e(
      Page,
      { key: 'p20', size: 'A4' as const, style: s.page },
      proposalHeader(),
      e(View, { style: { marginTop: 20 } },
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
