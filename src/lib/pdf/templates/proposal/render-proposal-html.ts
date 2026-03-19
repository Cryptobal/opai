/**
 * Genera HTML completo de la Propuesta Técnica para rendering con Playwright.
 * Recibe ProposalProps y retorna un string HTML listo para page.setContent().
 */

import type { ProposalProps } from './build-proposal-props';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export interface ProposalAssets {
  gardLogoBase64: string;
  gardEscudoBase64: string;
  clientLogos: Array<{ name: string; base64: string }>;
}

export function renderProposalHTML(props: ProposalProps, assets: ProposalAssets): string {
  const {
    companyName, companyLogo, quotationCode, proposalDate,
    contactName, contactPosition, ai,
    serviceType, installationName, installationAddress,
    coverageSchedule, staffingCount, staffingRegime,
    supervisionFrequency, items, totalNetoFormatted, paymentTerms,
    companyConfig, companyStats, regimeExplanation,
  } = props;

  const logo = logoSvgBase64();
  const clientLogoImg = companyLogo
    ? `<img src="${esc(companyLogo)}" style="height:36px;max-width:100px;border-radius:4px;background:white;padding:3px;object-fit:contain;" />`
    : '';
  const clientLogoHeader = companyLogo
    ? `<img src="${esc(companyLogo)}" style="height:22px;border-radius:50%;background:white;padding:2px;object-fit:contain;" />`
    : '<span></span>';

  const resumenParrafos = ai.resumenEjecutivo.split(/\n\n+/).filter(p => p.trim());
  const analisisParrafos = ai.analisisNecesidades.split(/\n\n+/).filter(p => p.trim());

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

  const portales = [
    { name: 'Portal Clientes', desc: 'Dashboard 24/7 con reportes, rondas, cotizaciones y chat directo.' },
    { name: 'Portal Guardias', desc: 'App móvil para turnos, rondas, incidentes con foto y GPS.' },
    { name: 'Portal Supervisores', desc: 'Verificación en terreno, inspecciones y rondas aleatorias.' },
    { name: 'Portal Rondas', desc: 'Checkpoints NFC/QR con hora, GPS y evidencia fotográfica.' },
    { name: 'Portal Acceso', desc: 'Control de acceso, lectura cédula QR, OCR patentes, offline.' },
    { name: 'Portal Admin', desc: 'Centro de comando: personal, turnos, finanzas, reportes, legal.' },
  ];

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

  const devItems = [
    'Integración con su sistema ERP o control de acceso existente',
    'Módulo de control de acceso vehicular con OCR de patentes',
    'Gestión automatizada de visitas con pre-registro',
    'Dashboards personalizados para gerencia',
    'Alertas inteligentes basadas en patrones de riesgo con AI',
    'Aplicaciones de control específicas para su industria',
  ];

  const compRows = [
    { m: 'No sabe si el guardia llegó', g: 'Check-in digital con GPS y hora' },
    { m: 'Rondas sin evidencia', g: 'Cada checkpoint con foto + GPS + timestamp' },
    { m: 'Incidentes que se pierden', g: 'Registro digital con seguimiento automático' },
    { m: 'Reportes manuales o inexistentes', g: 'Reportes automáticos diarios, semanales y mensuales' },
    { m: 'Sin visibilidad en tiempo real', g: 'Dashboard ejecutivo 24/7' },
    { m: 'Comunicación por WhatsApp', g: 'Chat operacional trazado en OPAI' },
    { m: 'Documentación en papel', g: 'Todo digital, accesible y descargable' },
    { m: 'Supervisión esporádica', g: 'Mínimo 2 supervisiones por turno' },
    { m: 'Cumplimiento DT incierto', g: 'Resolución Exenta N°38 implementada' },
    { m: 'Proveedor genérico', g: 'Desarrollo a medida con LX3.ai' },
  ];

  const niveles = [
    { label: 'Nivel 5 — Gestión', desc: 'Análisis, KPIs, mejora continua, reuniones mensuales', cls: 'pyramid-5' },
    { label: 'Nivel 4 — Reportabilidad', desc: 'Informes automáticos, dashboard ejecutivo', cls: 'pyramid-4' },
    { label: 'Nivel 3 — Control', desc: 'Trazabilidad digital completa vía OPAI', cls: 'pyramid-3' },
    { label: 'Nivel 2 — Supervisión', desc: 'Verificación activa en terreno, mínimo 2x por turno', cls: 'pyramid-2' },
    { label: 'Nivel 1 — Guardia', desc: 'Presencia física profesional, selección rigurosa', cls: 'pyramid-1' },
  ];

  const pilares = [
    { title: 'Personal Profesional', items: ['Funnel 100→12, evaluación psicológica, verificación antecedentes', 'Tasa de permanencia: 85% (industria: 50-60%)', 'Perfiles gestionados en OPAI con documentación digital'] },
    { title: 'Supervisión Permanente', items: ['Mínimo 2 supervisiones por turno, máximo 4h sin verificación', '4 niveles de supervisión con registro en OPAI', 'Rondas aleatorias de coordinadores de zona'] },
    { title: 'Control y Trazabilidad (OPAI)', items: ['Rondas NFC/QR con foto + GPS + timestamp', 'Registro digital de incidentes en tiempo real', 'Todo visible para el cliente en su Portal'] },
    { title: 'Gestión Orientada a Resultados', items: ['Dashboard ejecutivo con KPIs en tiempo real', 'Reuniones mensuales de gestión con datos de OPAI', 'Mejora continua basada en métricas'] },
  ];

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

  const reportes = [
    { tipo: 'Reporte Diario', freq: 'Todos los días', items: ['Novedades del turno', 'Incidentes registrados', 'Rondas completadas', 'Personal en servicio'] },
    { tipo: 'Reporte Semanal', freq: 'Cada semana', items: ['Tendencias de incidentes', 'KPIs operativos', 'Observaciones de supervisión', 'Recomendaciones'] },
    { tipo: 'Dashboard Ejecutivo Mensual', freq: 'Mensual', items: ['Análisis de resultados', 'Cumplimiento de SLAs', 'Estadísticas comparativas', 'Plan de mejora'] },
  ];

  const certItems = ['OS-10 vigente y verificable', 'Resolución Exenta N°38 implementada en OPAI', 'Ley Karin — Canal de denuncias activo', 'Código de Ética y Anticorrupción', 'Control biométrico facial + GPS según Art. 19'];
  const screenItems = ['Verificación antecedentes penales', 'Evaluación psicológica', 'Examen de salud ocupacional', 'Referencias laborales verificadas'];
  const seguroItems = ['Responsabilidad civil contra terceros', 'Seguros de accidentes laborales (mutual)', 'Fidelidad funcionaria (protección ante actos deshonestos del personal)', 'Póliza todo riesgo operacional', 'Documentación disponible para auditoría en menos de 24 horas'];

  const contRows = [
    { e: 'Ausencia programada', r: 'Reemplazo coordinado con 48h de anticipación' },
    { e: 'Ausencia imprevista', r: 'Cobertura en máximo 2 horas' },
    { e: 'Contingencia mayor', r: 'Plan activado inmediatamente' },
    { e: 'Aumento de demanda', r: 'Refuerzo disponible con 24h de aviso' },
  ];

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

  const propRows = [
    { label: 'Tipo de servicio', value: serviceType },
    { label: 'Instalación', value: `${installationName} · ${installationAddress}` },
    { label: 'Cobertura', value: coverageSchedule },
    { label: 'Dotación', value: `${staffingCount} guardias régimen ${staffingRegime}` },
    { label: 'Supervisión', value: supervisionFrequency },
    { label: 'Equipamiento incluido', value: 'Celulares, radios, linternas, uniformes' },
    { label: 'Tecnología incluida', value: 'Portal web, dashboard, control rondas, chat' },
  ];

  const implSteps = [
    { n: 1, title: 'Visita técnica + diagnóstico', desc: 'Levantamiento de necesidades' },
    { n: 2, title: 'Propuesta + contrato', desc: 'Aprobación y firma' },
    { n: 3, title: 'Reclutamiento + implementación', desc: 'Selección y capacitación' },
    { n: 4, title: 'Inicio operación + seguimiento', desc: 'Go-live con supervisión intensiva' },
  ];

  const clienteProvee = ['Caseta o espacio físico para guardia', 'Acceso a agua potable y baños', 'Lockers o espacio para pertenencias', 'Iluminación adecuada'];
  const servicioIncluye = ['Celulares corporativos, radios, linternas', 'Uniformes y credenciales', 'Reportes digitales', 'Supervisión 24/7', 'Control remoto de rondas', 'Seguros y cumplimiento legal'];

  const gardText1 = 'Empresa de seguridad privada autorizada (OS-10 vigente), con operación activa en múltiples regiones de Chile. Especializada en servicios de seguridad para entornos industriales, logísticos, de salud, retail y corporativos.';
  const gardText2 = 'Pero lo que nos hace diferentes no es solo nuestra gente — es cómo la gestionamos. Gard opera 100% sobre OPAI, nuestra plataforma tecnológica propietaria que convierte la seguridad en un servicio medible, trazable y transparente.';
  const lx3Text1 = 'OPAI es desarrollado y mantenido por LX3.ai, nuestro Software Studio especializado en aplicaciones con inteligencia artificial. LX3 forma parte del mismo holding, lo que significa que Gard no depende de proveedores externos para su tecnología: la construimos nosotros.';
  const lx3Text2 = 'Esto nos permite adaptar, escalar y desarrollar funcionalidades a medida para cada cliente. Si su operación necesita un módulo específico — control de acceso vehicular, gestión de visitas, integración con su ERP — lo construimos.';

  const chainItems = [
    { n: 1, cls: 'you', role: 'USTED', roleColor: 'color:var(--accent);', desc: `(${esc(companyName)}) — Su organización es nuestra prioridad` },
    { n: 2, cls: '', role: 'Ejecutivo de Cuenta', roleColor: '', desc: 'Consultas comerciales, ajustes de servicio, reuniones de gestión' },
    { n: 3, cls: '', role: 'Coordinador de Zona', roleColor: '', desc: 'Responsable operacional de su instalación, gestión del equipo' },
    { n: 4, cls: '', role: 'Supervisor Asignado', roleColor: '', desc: 'Verificación en terreno, mínimo 2 visitas por turno' },
    { n: 5, cls: '', role: 'Guardias Asignados', roleColor: '', desc: 'Ejecución del servicio en su instalación' },
    { n: 6, cls: '', role: 'Portal Cliente 24/7', roleColor: '', desc: 'Dashboard, reportes, chat, documentos — acceso permanente' },
  ];

  const pageHeader = `
    <div class="page-header">
      <img src="${logo}" style="height:22px;" />
      <span style="color:white;font-size:10pt;">Propuesta Técnica — ${esc(companyName)}</span>
      ${clientLogoHeader}
    </div>`;

  const pageFooter = `
    <div class="page-footer">
      <span>Confidencial · N° ${esc(quotationCode)}</span>
      <span>${esc(companyConfig.commercialName)} · ${esc(companyConfig.website)} · ${esc(companyConfig.phone)}</span>
    </div>`;

  const sectionTitle = (t: string) => `<h2 class="section-title">${esc(t)}</h2>`;
  const highlight = (t: string) => `<div class="highlight-box">${esc(t)}</div>`;
  const bullet = (items: string[], dot = '•') => items.map(i => `<div class="bullet-item"><span class="bullet-dot">${dot}</span><span>${esc(i)}</span></div>`).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<style>
@page { size: A4; margin: 0; }
@page:first { margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --navy: #0f172a; --navy-light: #1e293b; --navy-lighter: #334155;
  --accent: #e94560; --accent-light: #ff6b81; --teal: #14b8a6;
  --text: #334155; --text-light: #64748b; --text-lighter: #94a3b8;
  --bg-light: #f8fafc; --bg-alt: #f1f5f9; --border: #e2e8f0; --white: #ffffff;
  --success: #16a34a; --success-bg: #f0fdf4; --danger: #dc2626; --danger-bg: #fef2f2;
  --highlight-bg: #fff1f2;
}
body { font-family: 'Inter','Helvetica Neue',Arial,sans-serif; font-size: 10pt; color: var(--text); line-height: 1.5; }
.page-header { position: running(header); display: flex; align-items: center; justify-content: space-between; height: 45px; background: var(--navy); border-bottom: 3px solid var(--accent); padding: 0 15mm; }
.page-footer { position: running(footer); display: flex; align-items: center; justify-content: space-between; height: 25px; padding: 0 15mm; font-size: 7pt; color: var(--text-lighter); border-top: 1px solid var(--border); }
@page { @top-center { content: element(header); } @bottom-center { content: element(footer); } margin: 48px 15mm 30px 15mm; }
@page:first { @top-center { content: none; } @bottom-center { content: none; } margin: 0; }
.cover-page { width: 210mm; height: 297mm; background: var(--navy); color: white; position: relative; padding: 60px 48px; border-left: 8px solid var(--accent); display: flex; flex-direction: column; align-items: center; }
.page-break { break-before: page; }
.no-break { break-inside: avoid; }
.section-title { font-size: 20pt; font-weight: 700; color: var(--navy); margin-bottom: 4px; }
.section-title::after { content: ''; display: block; width: 40px; height: 3px; background: var(--accent); margin-top: 8px; margin-bottom: 16px; }
.section-subtitle { font-size: 11pt; color: var(--text-light); font-style: italic; margin-bottom: 16px; }
.body-text { font-size: 10pt; color: var(--text); line-height: 1.5; margin-bottom: 8px; }
.highlight-box { border-left: 4px solid var(--accent); background: var(--highlight-bg); padding: 12px 16px; font-weight: 600; font-size: 10pt; margin: 16px 0; break-inside: avoid; }
.table-gard { width: 100%; border-collapse: collapse; font-size: 9pt; }
.table-gard th { background: var(--navy); color: white; padding: 8px 12px; text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.5px; }
.table-gard td { padding: 8px 12px; border-bottom: 1px solid var(--border); }
.table-gard tr:nth-child(even) td { background: var(--bg-light); }
.table-compare .col-bad { background: var(--danger-bg); }
.table-compare .col-good { background: var(--success-bg); font-weight: 600; color: var(--success); }
.table-compare th.th-bad { background: var(--danger); }
.table-compare th.th-good { background: var(--success); }
.metric-badge { text-align: center; padding: 12px; }
.metric-badge .number { font-size: 28pt; font-weight: 800; color: var(--accent); }
.metric-badge .label { font-size: 8pt; color: var(--text-light); margin-top: 2px; }
.org-box { display: inline-block; padding: 8px 14px; border-radius: 4px; font-size: 8pt; text-align: center; min-width: 120px; }
.org-box.level-1 { background: var(--navy); color: white; font-weight: 700; font-size: 9pt; padding: 10px 20px; }
.org-box.level-2 { background: var(--navy-light); color: white; font-weight: 600; }
.org-box.level-3 { background: var(--bg-alt); color: var(--navy); border: 1px solid var(--border); }
.org-box.level-4 { background: var(--highlight-bg); color: var(--navy); border: 1px solid var(--accent); }
.org-connector { width: 2px; height: 16px; background: var(--text-lighter); margin: 0 auto; }
.pyramid-level { margin: 3px auto; padding: 10px 16px; color: white; font-size: 9pt; border-radius: 4px; text-align: center; }
.pyramid-5 { width: 50%; background: #0f172a; }
.pyramid-4 { width: 62%; background: #1e293b; }
.pyramid-3 { width: 74%; background: #334155; }
.pyramid-2 { width: 86%; background: #475569; color: white; }
.pyramid-1 { width: 98%; background: #64748b; color: white; }
.portals-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
.portal-card { border: 1px solid var(--border); border-radius: 6px; overflow: hidden; break-inside: avoid; }
.portal-card .placeholder { background: var(--bg-alt); height: 80px; display: flex; align-items: center; justify-content: center; font-size: 8pt; font-weight: 700; color: var(--text-light); text-transform: uppercase; letter-spacing: 1px; }
.portal-card .info { padding: 10px; }
.portal-card .info h4 { font-size: 9pt; font-weight: 700; margin: 0 0 4px 0; }
.portal-card .info p { font-size: 8pt; color: var(--text-light); margin: 0; line-height: 1.3; }
.pillars-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.pillar-card { border: 1px solid var(--border); border-top: 3px solid var(--accent); border-radius: 4px; padding: 14px; break-inside: avoid; }
.pillar-card .pillar-number { font-size: 24pt; font-weight: 800; color: var(--accent); opacity: 0.3; float: right; margin-top: -8px; }
.pillar-card h4 { font-size: 10pt; font-weight: 700; margin: 0 0 8px 0; }
.pillar-card ul { margin: 0; padding-left: 16px; font-size: 9pt; }
.pillar-card li { margin-bottom: 4px; }
.faq-item { border-bottom: 1px solid var(--border); padding: 10px 0; break-inside: avoid; }
.faq-item:last-child { border-bottom: none; }
.faq-question { font-weight: 700; font-size: 10pt; margin-bottom: 4px; }
.faq-answer { font-size: 9pt; color: var(--text-light); line-height: 1.4; }
.service-chain-item { display: flex; align-items: flex-start; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--bg-alt); }
.service-chain-item:last-child { border-bottom: none; }
.chain-number { width: 28px; height: 28px; border-radius: 50%; background: var(--accent); color: white; display: flex; align-items: center; justify-content: center; font-size: 11pt; font-weight: 700; flex-shrink: 0; }
.chain-number.you { background: var(--navy); width: 32px; height: 32px; }
.timeline-step { display: flex; gap: 12px; padding: 6px 0; }
.timeline-time { font-size: 8pt; font-weight: 700; color: var(--accent); width: 60px; flex-shrink: 0; padding-left: 8px; border-left: 3px solid var(--accent); }
.bullet-item { display: flex; gap: 6px; margin-bottom: 4px; padding-left: 4px; }
.bullet-dot { color: var(--accent); font-weight: 700; width: 10px; flex-shrink: 0; }
.signature-block { width: 45%; display: inline-block; vertical-align: top; }
.signature-line { border-bottom: 1px solid var(--navy); width: 200px; margin: 24px 0 4px 0; }
.signature-label { font-size: 8pt; color: var(--text-light); }
.two-col { display: flex; gap: 20px; }
.two-col > div { flex: 1; }
.reports-grid { display: flex; gap: 12px; }
.report-card { flex: 1; background: var(--bg-light); border-left: 3px solid var(--accent); padding: 12px; border-radius: 4px; break-inside: avoid; }
.report-card h4 { font-size: 9pt; font-weight: 700; margin: 0 0 4px; }
.report-card .freq { font-size: 8pt; color: var(--text-light); margin-bottom: 6px; }
.impl-grid { display: flex; gap: 12px; flex-wrap: wrap; }
.impl-card { flex: 1; min-width: 40%; background: var(--bg-light); border-left: 3px solid var(--accent); padding: 12px; border-radius: 4px; break-inside: avoid; }
</style>
</head>
<body>

${pageHeader}
${pageFooter}

<!-- PÁG 1: PORTADA -->
<div class="cover-page">
  <img src="${logo}" style="height:60px;margin-bottom:40px;" />
  <div style="width:40px;height:3px;background:var(--accent);margin-bottom:40px;"></div>
  <h1 style="font-size:28pt;letter-spacing:6px;font-weight:300;text-align:center;">PROPUESTA TÉCNICA</h1>
  <p style="font-size:13pt;letter-spacing:4px;opacity:0.7;text-align:center;margin-bottom:40px;">DE SERVICIO DE SEGURIDAD INTEGRAL</p>
  <h2 style="font-size:36pt;font-weight:800;text-align:center;margin-bottom:8px;">${esc(companyName)}</h2>
  <p style="font-size:11pt;opacity:0.8;font-style:italic;text-align:center;max-width:450px;margin-bottom:50px;">${esc(ai.descripcionBreve)}</p>
  <div style="display:flex;justify-content:center;gap:40px;margin-bottom:auto;">
    <div style="text-align:center;"><div style="font-size:32pt;font-weight:800;color:var(--accent);">67%</div><div style="font-size:8pt;opacity:0.6;">Reducción incidentes</div></div>
    <div style="width:1px;background:rgba(255,255,255,0.2);"></div>
    <div style="text-align:center;"><div style="font-size:32pt;font-weight:800;color:var(--accent);">96%</div><div style="font-size:8pt;opacity:0.6;">Rondas cumplidas</div></div>
    <div style="width:1px;background:rgba(255,255,255,0.2);"></div>
    <div style="text-align:center;"><div style="font-size:32pt;font-weight:800;color:var(--accent);">100%</div><div style="font-size:8pt;opacity:0.6;">Documentado</div></div>
    <div style="width:1px;background:rgba(255,255,255,0.2);"></div>
    <div style="text-align:center;"><div style="font-size:32pt;font-weight:800;color:var(--accent);">94%</div><div style="font-size:8pt;opacity:0.6;">Renovación</div></div>
  </div>
  <div style="position:absolute;bottom:40px;left:48px;right:48px;display:flex;justify-content:space-between;align-items:flex-end;">
    <div>
      <div style="font-size:10pt;">Preparada para: ${esc(contactName)}${contactPosition ? ` · ${esc(contactPosition)}` : ''}</div>
      <div style="font-size:9pt;opacity:0.6;margin-top:4px;">${esc(proposalDate)} · N° ${esc(quotationCode)}</div>
    </div>
    ${clientLogoImg}
  </div>
</div>

<!-- PÁG 2: RESUMEN EJECUTIVO -->
<div class="page-break"></div>
<div>
  ${sectionTitle('Resumen Ejecutivo')}
  ${resumenParrafos.map(p => `<p class="body-text">${esc(p)}</p>`).join('')}
  <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:16px;">
    <div class="highlight-box" style="flex:1;min-width:40%;"><div style="font-size:7pt;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-light);margin-bottom:4px;">Servicio</div><div style="font-weight:700;color:var(--navy);">${esc(serviceType)}</div></div>
    <div class="highlight-box" style="flex:1;min-width:40%;"><div style="font-size:7pt;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-light);margin-bottom:4px;">Dotación</div><div style="font-weight:700;color:var(--navy);">${staffingCount} guardias · ${esc(staffingRegime)}</div></div>
    <div class="highlight-box" style="flex:1;min-width:40%;"><div style="font-size:7pt;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-light);margin-bottom:4px;">Cobertura</div><div style="font-weight:700;color:var(--navy);">${esc(coverageSchedule)}</div></div>
    <div class="highlight-box" style="flex:1;min-width:40%;"><div style="font-size:7pt;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-light);margin-bottom:4px;">Inversión</div><div style="font-weight:700;color:var(--navy);">${esc(totalNetoFormatted)}</div></div>
  </div>
</div>

<!-- PÁG 3: ECOSISTEMA -->
<div class="page-break"></div>
<div>
  ${sectionTitle('Más que una empresa de seguridad. Un ecosistema tecnológico.')}
  <div class="two-col">
    <div><p class="body-text" style="font-weight:600;">Gard Security</p><p class="body-text">${esc(gardText1)}</p><p class="body-text">${esc(gardText2)}</p></div>
    <div><p class="body-text" style="font-weight:600;">LX3.ai</p><p class="body-text">${esc(lx3Text1)}</p><p class="body-text">${esc(lx3Text2)}</p></div>
  </div>
  <p class="body-text" style="font-weight:600;margin-top:16px;">Gard en números:</p>
  <div style="display:flex;gap:32px;margin-top:8px;">
    <div style="text-align:center;"><div style="font-size:18pt;font-weight:700;color:var(--accent);">${esc(companyStats.yearsInOperation)}</div><div style="font-size:8pt;color:var(--text-light);">años de operación</div></div>
    <div style="text-align:center;"><div style="font-size:18pt;font-weight:700;color:var(--accent);">${esc(companyStats.activeGuards)}</div><div style="font-size:8pt;color:var(--text-light);">guardias activos</div></div>
    <div style="text-align:center;"><div style="font-size:18pt;font-weight:700;color:var(--accent);">${esc(companyStats.protectedFacilities)}</div><div style="font-size:8pt;color:var(--text-light);">instalaciones protegidas</div></div>
    <div style="text-align:center;"><div style="font-size:18pt;font-weight:700;color:var(--accent);">${esc(companyStats.regionsCount)}</div><div style="font-size:8pt;color:var(--text-light);">regiones de Chile</div></div>
  </div>
</div>

<!-- PÁG 4: ORGANIGRAMA -->
<div class="page-break"></div>
<div>
  ${sectionTitle('Estructura corporativa Gard Security')}
  <div class="org-chart" style="text-align:center;margin-top:16px;">
    <div class="org-box level-1">GERENCIA GENERAL<br/><span style="font-weight:400;font-size:7pt;opacity:0.8;">Dirección estratégica</span></div>
    <div class="org-connector"></div>
    <div style="display:flex;justify-content:center;gap:12px;">
      <div style="flex:1;max-width:180px;text-align:center;"><div class="org-connector" style="height:12px;"></div><div class="org-box level-2" style="width:100%;">Dirección de<br/>Operaciones</div></div>
      <div style="flex:1;max-width:180px;text-align:center;"><div class="org-connector" style="height:12px;"></div><div class="org-box level-2" style="width:100%;">Dirección de<br/>Adm. y Finanzas</div></div>
      <div style="flex:1;max-width:180px;text-align:center;"><div class="org-connector" style="height:12px;"></div><div class="org-box level-2" style="width:100%;">Asesoría Legal<br/><span style="font-size:7pt;opacity:0.8;">OS-10 · Karin · DT</span></div></div>
    </div>
    <div style="display:flex;justify-content:center;gap:40px;margin-top:12px;">
      <div style="display:flex;flex-direction:column;gap:6px;align-items:center;">
        <div class="org-box level-3">Jefe de Operaciones</div>
        <div class="org-box level-3">RRHH y Selección</div>
        <div class="org-box level-3">Prev. de Riesgos</div>
        <div class="org-box level-3">Coord. Tecnología (OPAI/LX3)</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;align-items:center;">
        <div class="org-box level-3">Jefe de Administración</div>
        <div class="org-box level-3">Contabilidad y Finanzas</div>
      </div>
    </div>
    <div style="display:flex;justify-content:center;gap:12px;margin-top:16px;">
      <div class="org-box level-4">Coordinadores de Zona<br/><span style="font-size:7pt;">Supervisión regional</span></div>
      <div class="org-box level-4">Supervisores<br/><span style="font-size:7pt;">Verificación en terreno</span></div>
      <div class="org-box level-4">Guardias<br/><span style="font-size:7pt;">Ejecución del servicio</span></div>
    </div>
  </div>
  <hr style="border:none;border-top:1px solid var(--border);margin:24px 0;" />
  <h3 style="font-size:14pt;font-weight:700;color:var(--navy);margin-bottom:4px;">Su cadena de servicio directa</h3>
  <p style="font-size:9pt;color:var(--text-light);margin-bottom:12px;">Cada nivel tiene nombre, cargo y responsabilidad ante usted.</p>
  ${chainItems.map(c => `<div class="service-chain-item"><div class="chain-number ${c.cls}">${c.n}</div><div><strong style="${c.roleColor}">${esc(c.role)}</strong><br/><span style="font-size:9pt;color:var(--text-light);">${esc(c.desc)}</span></div></div>`).join('')}
  ${highlight('Usted no contrata guardias. Contrata una organización completa dedicada a su seguridad.')}
</div>

<!-- PÁG 5: OPAI -->
<div class="page-break"></div>
<div>
  ${sectionTitle('OPAI — La única plataforma integral de gestión de seguridad privada en Chile')}
  <p class="section-subtitle">Cada guardia, cada ronda, cada incidente, cada reporte — todo en un solo sistema.</p>
  <p class="body-text">OPAI no es un software genérico adaptado a seguridad. Es una plataforma diseñada desde cero para operar empresas de seguridad privada, con más de 20 módulos en producción y 6 aplicaciones especializadas que trabajan en tiempo real.</p>
  <p class="body-text">Cuando usted contrata Gard, no recibe solo guardias. Recibe acceso a un ecosistema tecnológico que le da visibilidad total de lo que ocurre en sus instalaciones, en todo momento.</p>
  <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:12px;">
    ${modulos.map(m => `<div style="width:48%;" class="bullet-item"><span class="bullet-dot">•</span><span style="font-size:9pt;">${esc(m)}</span></div>`).join('')}
  </div>
</div>

<!-- PÁG 6: PORTALES 3x2 -->
<div class="page-break"></div>
<div>
  ${sectionTitle('6 portales especializados')}
  <p class="section-subtitle">Cada usuario ve exactamente lo que necesita.</p>
  <div class="portals-grid">
    ${portales.map(p => `<div class="portal-card"><div class="placeholder">${esc(p.name).toUpperCase()}</div><div class="info"><h4>${esc(p.name)}</h4><p>${esc(p.desc)}</p></div></div>`).join('')}
  </div>
  <p style="font-size:9pt;color:var(--text-light);margin-top:16px;text-align:center;font-style:italic;">Cada portal es una PWA instalable. Funciona en cualquier dispositivo, incluso sin conexión.</p>
</div>

<!-- PÁG 7: TECNOLOGÍA INCLUIDA -->
<div class="page-break"></div>
<div>
  ${sectionTitle('Todo esto está incluido. Sin costo adicional. Sin licencias.')}
  <table class="table-gard">
    <thead><tr><th style="width:28%;">Funcionalidad</th><th style="width:36%;">Qué es</th><th style="width:36%;">Beneficio para usted</th></tr></thead>
    <tbody>${techRows.map(r => `<tr><td>${esc(r.fn)}</td><td>${esc(r.q)}</td><td>${esc(r.ben)}</td></tr>`).join('')}</tbody>
  </table>
  ${highlight('Otros proveedores le venden el guardia y usted no sabe qué pasa. Nosotros le entregamos el control completo.')}
</div>

<!-- PÁG 8: DESARROLLO A MEDIDA -->
<div class="page-break"></div>
<div>
  ${sectionTitle('¿Necesita algo que no existe? Lo construimos.')}
  <p class="body-text">Gracias a LX3.ai, nuestro Software Studio con capacidad de desarrollo full-stack e inteligencia artificial, Gard puede construir módulos y aplicaciones a medida para complementar su servicio de seguridad.</p>
  <p class="body-text">Si su operación requiere integraciones específicas, automatizaciones, o herramientas que hoy no existen en el mercado — podemos diseñarlas, desarrollarlas e integrarlas directamente en OPAI.</p>
  ${bullet(devItems)}
  ${highlight('No somos una empresa de seguridad que compró un software. Somos una empresa de seguridad que construye su propia tecnología.')}
</div>

<!-- PÁG 9: TABLA COMPARATIVA -->
<div class="page-break"></div>
<div>
  ${sectionTitle('El verdadero riesgo no es la ausencia de seguridad. Es la falsa sensación de control.')}
  <p class="section-subtitle">73% de las empresas descubre fallas solo después de un incidente grave.</p>
  <table class="table-gard table-compare">
    <thead><tr><th class="th-bad" style="width:50%;">MERCADO TRADICIONAL</th><th class="th-good" style="width:50%;">GARD + OPAI</th></tr></thead>
    <tbody>${compRows.map(r => `<tr><td class="col-bad">${esc(r.m)}</td><td class="col-good">${esc(r.g)}</td></tr>`).join('')}</tbody>
  </table>
</div>

<!-- PÁG 10: PIRÁMIDE + PILARES -->
<div class="page-break"></div>
<div>
  ${sectionTitle('No vendemos guardias. Implementamos un sistema de seguridad gestionado.')}
  <div style="margin:24px 0;">
    ${niveles.map(n => `<div class="pyramid-level ${n.cls}"><strong>${esc(n.label)}:</strong> ${esc(n.desc)}</div>`).join('')}
  </div>
  ${highlight('Cada capa refuerza la anterior. Ninguna funciona aislada.')}
  ${sectionTitle('Framework estructurado que sostiene toda nuestra operación')}
  <div class="pillars-grid">
    ${pilares.map((p, i) => `<div class="pillar-card no-break"><div class="pillar-number">${i + 1}</div><h4>${esc(p.title)}</h4><ul>${p.items.map(it => `<li>${esc(it)}</li>`).join('')}</ul></div>`).join('')}
  </div>
</div>

<!-- PÁG 11: SLA + ESCALAMIENTO -->
<div class="page-break"></div>
<div>
  ${sectionTitle('Usted se entera de TODO, PRIMERO. Sin filtros, sin demoras.')}
  <div style="display:flex;gap:16px;margin-bottom:16px;">
    <div class="report-card"><h4>1. Detección</h4><p style="font-size:8pt;color:var(--text-light);">Inmediato: Identificación del evento</p></div>
    <div class="report-card"><h4>2. Reporte</h4><p style="font-size:8pt;color:var(--text-light);">≤15 minutos: Notificación al cliente</p></div>
    <div class="report-card"><h4>3. Acción</h4><p style="font-size:8pt;color:var(--text-light);">≤2 horas: Respuesta coordinada</p></div>
  </div>
  <p class="body-text" style="font-weight:600;">Compromisos SLA:</p>
  <table class="table-gard">
    <tbody>${slaRows.map(r => `<tr><td style="width:60%;">${esc(r.label)}</td><td style="font-weight:600;color:var(--navy);">${esc(r.value)}</td></tr>`).join('')}</tbody>
  </table>
  <div style="margin-top:20px;">
    <h3 style="font-size:14pt;font-weight:700;color:var(--navy);margin-bottom:4px;">Protocolo de escalamiento</h3>
    <div style="width:40px;height:3px;background:var(--accent);margin-top:4px;margin-bottom:12px;"></div>
    ${escalamientoSteps.map(st => `<div class="timeline-step"><div class="timeline-time">${esc(st.time)}</div><div style="font-size:9pt;">${esc(st.action)}</div></div>`).join('')}
  </div>
</div>

<!-- PÁG 12: REPORTABILIDAD -->
<div class="page-break"></div>
<div>
  ${sectionTitle('Información cuando la necesitas')}
  <div class="reports-grid">
    ${reportes.map(r => `<div class="report-card"><h4>${esc(r.tipo)}</h4><div class="freq">${esc(r.freq)}</div>${r.items.map(it => `<div class="bullet-item"><span class="bullet-dot">•</span><span style="font-size:9pt;">${esc(it)}</span></div>`).join('')}</div>`).join('')}
  </div>
  ${highlight('Acceso web 24/7 a tu dashboard personalizado. Incluido en el servicio.')}
</div>

<!-- PÁG 13: CUMPLIMIENTO LEGAL + SEGUROS -->
<div class="page-break"></div>
<div>
  ${sectionTitle('Tranquilidad operativa, legal y financiera')}
  <p class="body-text" style="font-weight:600;">Certificaciones:</p>
  ${bullet(certItems, '✓')}
  <p class="body-text" style="font-weight:600;margin-top:12px;">Screening de personal:</p>
  ${bullet(screenItems, '✓')}
  <p class="body-text" style="font-weight:600;margin-top:12px;">Cobertura de seguros:</p>
  ${bullet(seguroItems)}
  ${highlight('Si la Dirección del Trabajo solicita documentación, la tendrá en su email en menos de 24 horas hábiles.')}
</div>

<!-- PÁG 14: CONTINGENCIA + RESULTADOS -->
<div class="page-break"></div>
<div>
  ${sectionTitle('Planes de contingencia para cualquier escenario')}
  <table class="table-gard">
    <thead><tr><th style="width:35%;">Escenario</th><th>Respuesta</th></tr></thead>
    <tbody>${contRows.map(r => `<tr><td>${esc(r.e)}</td><td>${esc(r.r)}</td></tr>`).join('')}</tbody>
  </table>
  <div style="text-align:center;margin:16px 0;"><div class="metric-badge"><div class="number">99,5%</div><div class="label">Cumplimiento turnos</div></div></div>
  ${sectionTitle('Resultados con clientes reales')}
  <div style="display:flex;gap:24px;margin-bottom:16px;">
    <div class="metric-badge"><div class="number">67%</div><div class="label">Reducción incidentes</div></div>
    <div class="metric-badge"><div class="number">96%</div><div class="label">Cumplimiento rondas</div></div>
    <div class="metric-badge"><div class="number">4.7/5</div><div class="label">Satisfacción</div></div>
    <div class="metric-badge"><div class="number">94%</div><div class="label">Renovación</div></div>
  </div>
  <p class="body-text" style="font-weight:600;">Sectores con experiencia:</p>
  <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">
    ${ai.sectoresRelevantes.map(s => `<span style="background:var(--bg-alt);padding:4px 8px;border-radius:4px;font-size:8pt;">${esc(s)}</span>`).join('')}
  </div>
  <p class="body-text" style="font-weight:600;">Clientes que confían en Gard:</p>
  <p class="body-text" style="font-size:9pt;color:var(--text-light);">Polpaico · International Paper · Tritec · Sparta · Tattersall · Transmat · BBosch · Embajada de Brasil · GL Events · y más</p>
  <p style="font-size:8pt;color:var(--text-light);">Referencias disponibles bajo solicitud y NDA.</p>
</div>

<!-- PÁG 15: FAQ -->
<div class="page-break"></div>
<div>
  ${sectionTitle('Preguntas frecuentes')}
  ${faqItems.map(f => `<div class="faq-item"><div class="faq-question">${esc(f.q)}</div><div class="faq-answer">${esc(f.a)}</div></div>`).join('')}
</div>

<!-- PÁG 16: PROPUESTA PERSONALIZADA -->
<div class="page-break"></div>
<div>
  ${sectionTitle(`Propuesta de servicio para ${esc(companyName)}`)}
  ${analisisParrafos.map(p => `<p class="body-text">${esc(p)}</p>`).join('')}
  <table class="table-gard" style="margin-top:12px;">
    <tbody>${propRows.map(r => `<tr><td style="width:35%;">${esc(r.label)}</td><td style="font-weight:600;color:var(--navy);">${esc(r.value)}</td></tr>`).join('')}</tbody>
  </table>
  ${regimeExplanation ? highlight(regimeExplanation) : ''}
</div>

<!-- PÁG 17: INVERSIÓN -->
<div class="page-break"></div>
<div>
  ${sectionTitle('Inversión Mensual')}
  <table class="table-gard">
    <thead><tr><th style="width:6%;">#</th><th style="width:44%;">Descripción</th><th style="width:10%;">Cant.</th><th style="width:20%;">P. Unitario</th><th style="width:20%;">Subtotal</th></tr></thead>
    <tbody>
      ${items.map(it => `<tr><td>${it.index}</td><td>${esc(it.description)}</td><td>${it.quantity}</td><td>${esc(it.unitPriceFormatted)}</td><td style="font-weight:600;color:var(--navy);">${esc(it.subtotalFormatted)}</td></tr>`).join('')}
    </tbody>
    <tfoot><tr><td colspan="4" style="background:var(--navy);color:white;font-weight:700;text-transform:uppercase;font-size:8pt;letter-spacing:0.5px;padding:8px 12px;">TOTAL NETO</td><td style="background:var(--navy);color:var(--teal);font-weight:700;padding:8px 12px;">${esc(totalNetoFormatted)}</td></tr></tfoot>
  </table>
  <p style="font-size:8pt;margin-top:8px;">Valores netos. IVA se factura según ley.</p>
  <p style="font-size:9pt;margin-top:4px;">Forma de pago: ${esc(paymentTerms)}</p>
  ${items.filter(it => it.specifications).map(it => `<div style="margin-top:8px;"><p style="font-size:8pt;font-weight:600;">${esc(it.description)}</p><p style="font-size:8pt;">${esc(it.specifications!)}</p></div>`).join('')}
</div>

<!-- PÁG 18: IMPLEMENTACIÓN -->
<div class="page-break"></div>
<div>
  ${sectionTitle('De la firma al servicio operativo en ≤15 días')}
  <p class="body-text" style="font-weight:600;">¿Viene de otro proveedor? Transición sin interrupciones.</p>
  <p class="body-text">Si hoy trabaja con otra empresa de seguridad, Gard gestiona la transición completa. Relevamos planos, puntos críticos, protocolos existentes y realizamos inducción específica de su instalación antes del día 1. El cambio es imperceptible para su operación.</p>
  <div class="impl-grid" style="margin-top:12px;">
    ${implSteps.map(st => `<div class="impl-card"><h4 style="font-size:9pt;font-weight:700;margin:0 0 4px;">${st.n}. ${esc(st.title)}</h4><p style="font-size:9pt;">${esc(st.desc)}</p></div>`).join('')}
  </div>
  <p class="body-text" style="font-weight:600;margin-top:16px;">Qué ocurre el Día 1</p>
  <p class="body-text">Presencia de supervisor durante el primer turno completo. Verificación de todos los sistemas: checkpoints NFC instalados, app configurada, portal activado con sus credenciales. Usted recibe su primer reporte antes de cumplirse 24 horas de operación.</p>
</div>

<!-- PÁG 19: TÉRMINOS + GARANTÍA + CTA + FIRMAS -->
<div class="page-break"></div>
<div>
  ${sectionTitle('Transparencia en qué necesitamos y qué incluimos')}
  <div class="two-col">
    <div>
      <p class="body-text" style="font-weight:600;">El cliente debe proveer:</p>
      ${bullet(clienteProvee)}
    </div>
    <div>
      <p class="body-text" style="font-weight:600;">El servicio incluye:</p>
      ${bullet(servicioIncluye)}
    </div>
  </div>
  ${highlight('Garantía Gard: Si durante los primeros 30 días de operación el servicio no cumple con los estándares comprometidos en esta propuesta, puede desvincularse sin penalidad. Así de seguros estamos de nuestro nivel de servicio.')}

  <div style="margin-top:24px;">
    ${sectionTitle('Próximos pasos')}
    ${['Agendar visita técnica sin costo', 'Revisar y ajustar propuesta si es necesario', 'Firma de contrato', 'Servicio activo en ≤15 días'].map((s, i) => `<div class="bullet-item"><span class="bullet-dot">${i + 1}.</span><span>${esc(s)}</span></div>`).join('')}
    <p class="body-text" style="font-weight:600;margin-top:16px;">¿Tiene dudas? Conversemos:</p>
    <p class="body-text">WhatsApp: +56 98 230 7771 · Email: ${esc(companyConfig.email)} · Web: ${esc(companyConfig.website)}</p>
  </div>

  <div style="margin-top:24px;">
    ${sectionTitle('Aceptación de Propuesta')}
    <div style="display:flex;gap:40px;">
      <div class="signature-block">
        <p style="font-weight:600;font-size:9pt;">Por Gard Security:</p>
        <div class="signature-line"></div>
        <p class="signature-label">Nombre: ____________________</p>
        <p class="signature-label">Cargo: Gerente Comercial</p>
        <p class="signature-label">Firma: ____________________</p>
        <p class="signature-label">Fecha: ____________________</p>
      </div>
      <div class="signature-block">
        <p style="font-weight:600;font-size:9pt;">Por ${esc(companyName)}:</p>
        <div class="signature-line"></div>
        <p class="signature-label">Nombre: ${esc(contactName)}</p>
        <p class="signature-label">Cargo: ${esc(contactPosition || '____________________')}</p>
        <p class="signature-label">Firma: ____________________</p>
        <p class="signature-label">Fecha: ____________________</p>
      </div>
    </div>
    <p style="font-size:8pt;margin-top:24px;text-align:center;">Esta propuesta tiene una validez de 30 días desde su fecha de emisión.</p>
    <p style="font-size:7pt;margin-top:12px;text-align:center;color:var(--text-light);">Propuesta generada por OPAI — Plataforma desarrollada por LX3.ai</p>
  </div>
</div>

</body>
</html>`;
}
