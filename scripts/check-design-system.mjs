#!/usr/bin/env node
/**
 * OPAI Design System — Pre-Commit Guard
 *
 * Escanea archivos staged (.tsx / .ts / .css) y rechaza el commit si encuentra
 * violaciones del Design System v3 dentro de módulos ya migrados.
 *
 * Modo:
 *   - "strict"  → bloquea commit, exit 1
 *   - "warn"    → muestra warnings, exit 0
 *
 * El modo se decide POR ARCHIVO según MIGRATED_PATHS (lista abajo). Cuando un
 * módulo termina de migrar, se agrega su prefijo a la lista y a partir de ese
 * momento queda protegido.
 *
 * Uso:
 *   node scripts/check-design-system.mjs              ← solo staged (pre-commit)
 *   node scripts/check-design-system.mjs --all        ← repo entero (CI / manual)
 *   node scripts/check-design-system.mjs --warn-only  ← nunca bloquea, solo reporta
 *
 * Escape hatch:
 *   Si una primera línea contiene "// @ds-allow-legacy <razón>", el archivo se salta.
 *   Usar SOLO en casos justificados; las concesiones quedan visibles con:
 *     git grep "@ds-allow-legacy"
 */

import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { extname } from "node:path";

const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

// ───────────────────────────────────────────────────────────────────
// Lista de módulos YA MIGRADOS (modo strict).
// Editar al terminar cada migración. Ver AGENTS.md sección "DS Migration Status".
// ───────────────────────────────────────────────────────────────────
const MIGRATED_PATHS = [
  "src/components/inventario/",
  "src/app/(app)/ops/inventario/",
  "src/components/opai-ds/",
  // Conocimiento — fase A: page + componentes hojas. _primitives.tsx
  // sigue intacto porque Portal Cliente lo consume; se elimina en fase B.
  "src/components/opai/conocimiento/InstallationCard.tsx",
  "src/components/opai/conocimiento/InstallationTile.tsx",
  "src/components/opai/conocimiento/SectionComplianceList.tsx",
  "src/components/opai/conocimiento/GuardsList.tsx",
  "src/components/opai/conocimiento/HeatmapMatrix.tsx",
  "src/app/(app)/personas/conocimiento/",
  // Portal Cliente — fase 3B: tab Conocimiento del equipo migrada.
  // Otros archivos del portal cliente (Bitácora, GuardiaDetalle, etc.)
  // no están migrados y se hacen en sesiones futuras.
  "src/components/portal/cliente/PortalConocimientoEquipo.tsx",
  "src/components/portal/cliente/PortalProtocolos.tsx",
  // Paso 4A — solo migró KpiCard/KpiGrid → Stat/StatGrid.
  // Los call sites NO se agregan a MIGRATED_PATHS porque el guard valida
  // archivos completos: estos archivos siguen teniendo colores hardcoded
  // y otros patrones legacy fuera del KPI. Cuando un módulo termine su
  // migración completa (no solo KPIs), agregar el path aquí.
  //
  // Paso 4B — consolidó EmptyState legacy → EmptyState DS v3 en 22 call sites
  // (docs/, finance/, ops/). Mismo criterio que 4A: los call sites NO se
  // agregan porque siguen teniendo otros patrones legacy (text-[10px],
  // hardcoded colors, etc.) fuera del EmptyState migrado.
  //
  // Paso 4C — consolidó DataTable legacy → DataTable DS v3 en 13 Client
  // Components (8 finance/ + 5 ops/rondas/). Mismo criterio: call sites NO
  // se agregan. Especialmente Rondas/* tiene drift dark-only (text-[#94a3b8],
  // bg-[#0a0f1c]) que se aborda en una sesión futura específica de Rondas.
  // Los 3 Server Component pages (auditoria, audit-pautas, payroll/parameters)
  // NO se migraron — quedan con DataTable legacy hasta sesión 4F (column
  // defs con render functions no cruzan la frontera RSC).
  //
  // Paso 4D — cluster final chico (Avatar, Breadcrumb, LoadingSpinner,
  // StatusBadge, FilterBar, ModuleCard, Stepper, FormField). 8 componentes
  // legacy eliminados. Mismo criterio: los call sites NO se agregan a
  // MIGRATED_PATHS porque siguen teniendo otros patrones legacy fuera de
  // los componentes migrados. Único helper nuevo agregado: StatusTag.
  "src/components/ops/StatusTag.tsx",
  // Paso 4C2 — refactor 3 pages legacy + nuevos audit/* CCs.
  // SC pages (auditoria, audit-pautas) refactoreadas al patrón SC + CC
  // wrapper para resolver el problema de cell functions cruzando la
  // frontera RSC. payroll/parameters (CC standalone) migración mecánica.
  //
  // Solo se agregan las 2 SC pages + 2 nuevos audit/* CCs porque están
  // 100% limpios. payroll/parameters/page.tsx NO se agrega (mismo
  // criterio que 4A/4B/4C/4D): el archivo sigue teniendo colores
  // hardcoded fuera del DataTable migrado.
  //
  // NOTA: la deletion final de DataTable/EmptyState/LoadingState legacy
  // queda pendiente de una sesión follow-up que migre los ~27 archivos
  // restantes (crm/, gamification/, portal/, cpq/, ops/guardia-sections/)
  // que importan via direct-path (`@/components/opai/<Component>`).
  "src/app/(app)/opai/configuracion/auditoria/page.tsx",
  "src/app/(app)/ops/audit-pautas/page.tsx",
  "src/components/audit/AuditLogsTable.tsx",
  "src/components/audit/PautasAuditTable.tsx",
  // Cluster 5A.1 — Dashboard CRM + Leads list (hero pattern DS v3).
  // Solo las 2 pages SC se agregan: ambas quedan 100% limpias tras la
  // migración a <PageHero>. CrmLeadsClient.tsx (CC) NO se agrega:
  // mismo criterio que 4A/4B/4C/4D — el archivo migra el EmptyState al
  // DS v3 pero sigue teniendo drift legacy fuera de eso (text-[10px]
  // en Badges de la lista). Se agregará cuando se haga su pasada de
  // limpieza completa en una sub-fase futura.
  "src/app/(app)/crm/page.tsx",
  "src/app/(app)/crm/leads/page.tsx",
  // Cluster 5A.2 — EntityDetailLayout (header compartido por 6 fichas
  // de detalle) + lista de Cuentas migrados al patrón hero DS v3.
  // Solo /crm/accounts page (SC) se agrega: queda 100% limpia tras
  // el cambio a <PageHero>. EntityDetailLayout.tsx y CrmAccountsClient.tsx
  // (CC) NO se agregan: mismo criterio que 4A/4B/4C/4D/5A.1 — los
  // archivos migran su parte (header visual / EmptyState al DS v3) pero
  // siguen teniendo drift legacy fuera de eso (text-[10px] en chip
  // de estado mobile / Badges de cards). Se agregarán cuando se haga
  // su pasada de limpieza completa en una sub-fase futura.
  "src/app/(app)/crm/accounts/page.tsx",
  // Cluster 5A.3 — Lista de Contactos migrada al patrón hero DS v3.
  // Solo /crm/contacts page (SC) se agrega: queda 100% limpia tras
  // el cambio a <PageHero>. CrmContactsClient.tsx (CC) NO se agrega:
  // mismo criterio que 4A/4B/4C/4D/5A.1/5A.2 — el archivo migra el
  // EmptyState al DS v3 pero sigue teniendo drift legacy fuera de eso
  // (text-[10px] en Badges/chips de la lista, hardcoded emerald). Se
  // agregará cuando se haga su pasada de limpieza completa en una
  // sub-fase futura. La ficha /crm/contacts/[id] ya quedó migrada
  // por 5A.2 (heredada de EntityDetailLayout).
  "src/app/(app)/crm/contacts/page.tsx",
  // Cluster 5A.4 — Lista de Negocios migrada al patrón hero DS v3.
  // Solo /crm/deals page (SC) se agrega: queda 100% limpia tras
  // el cambio a <PageHero> (preservando la lógica dinámica de
  // description según el filtro `focus`). CrmDealsClient.tsx (CC)
  // NO se agrega: mismo criterio que 4A/4B/4C/4D/5A.1/5A.2/5A.3 —
  // el archivo migra los 3 EmptyState al DS v3 pero sigue teniendo
  // drift legacy fuera de eso (text-[10px]/text-[11px] en cards del
  // kanban e indicadores de follow-up, hardcoded emerald/amber/red en
  // badges de estado). Se agregará cuando se haga su pasada de
  // limpieza completa en una sub-fase futura. La ficha
  // /crm/deals/[id] ya quedó migrada por 5A.2 (heredada de
  // EntityDetailLayout).
  "src/app/(app)/crm/deals/page.tsx",
  // Cluster 5A.5 — Lista de Cotizaciones migrada al patrón hero DS v3.
  // Solo /crm/cotizaciones page (SC) se agrega: queda 100% limpia tras
  // el cambio a <PageHero> (preservando CpqIndicators como `actions`).
  // CrmCotizacionesClient.tsx (CC) NO se agrega: mismo criterio que
  // 4A/4B/4C/4D/5A.1/5A.2/5A.3/5A.4 — el archivo migra el EmptyState
  // al DS v3 (consolidado al export de @/components/opai-ds) pero sigue
  // teniendo drift legacy fuera de eso (text-[10px]/text-[11px] en
  // badges/chips de la lista y cards, hardcoded emerald/amber/red en
  // STATUS_MAP). Se agregará cuando se haga su pasada de limpieza
  // completa en una sub-fase futura.
  // CpqQuoteDetail.tsx NO se agrega: solo se hace cleanup mínimo del
  // EmptyState interno del tab "Puestos". Sus headers transaccionales
  // (mobile sticky + desktop card) NO son candidatos al hero pattern
  // por diseño (status, portal toggle, send-invoice, generate-PDF,
  // contexto CRM). Se evaluará en una sub-fase futura del CPQ si
  // decidimos auditar el archivo completo.
  "src/app/(app)/crm/cotizaciones/page.tsx",
  // Cluster 5A.6 — Patrón tipográfico unificado en CRM.
  // <Label> base ahora default text-xs uppercase tracking-wide
  // text-muted-foreground. Las 5 fichas del CRM (Lead, Account,
  // Contact, Deal, Installation) limpiaron sus 101 overrides
  // redundantes de Label y unificaron 8 headings (h2/h3) al mismo
  // patrón con font-semibold. Esto unifica el lenguaje tipográfico
  // entre tabs editables y tabs read-only (DetailField).
  //
  // Solo se agrega src/components/ui/label.tsx (queda 100% limpio
  // tras el cambio del default). Los 5 Crm*DetailClient.tsx NO se
  // agregan: mismo criterio que 4A/4B/4C/4D/5A.1/5A.2/5A.3/5A.4/5A.5
  // — los archivos completaron su parte tipográfica pero siguen
  // teniendo drift legacy fuera de eso (hardcoded amber/emerald/red,
  // text-[10px] en chips, etc.). Se agregarán cuando se haga su
  // pasada de limpieza completa en una sub-fase futura.
  "src/components/ui/label.tsx",
  // Cluster 5A.7.a — Lista global de Instalaciones + lista anidada en
  // ficha de Cuenta migradas al patrón hero / Tag / IconBubble del DS v3.
  // Drift dark-only eliminado en status badges, PPC badges, icon containers
  // y Moon icon nocturno (bg-emerald/amber/red/blue/zinc-500/X →
  // <Tag variant>/<IconBubble tone>; text-indigo-400 → text-status-info-fg).
  //
  // Solo /crm/installations page (SC) se agrega: queda 100% limpia tras
  // el cambio a <PageHero>. CrmInstallationsListClient.tsx y
  // CrmInstallationsClient.tsx (CC) NO se agregan: mismo criterio que
  // 4A/4B/4C/4D/5A.1/5A.2/5A.3/5A.4/5A.5/5A.6 — los archivos completaron
  // su migración del badging/icons al DS v3 pero conservan text-[11px]
  // en counters (decisión deliberada del prompt 5A.7.a para alinear con
  // el resto de los chips chicos del CRM) y bg-emerald-600 en el botón
  // Crear del modal (preservado por la regla "no tocar el modal" del
  // prompt). Se agregarán cuando se haga su pasada de limpieza completa
  // en una sub-fase futura. La ficha /crm/installations/[id]
  // (CrmInstallationDetailClient, 3.002 líneas) queda para 5A.7.b.
  "src/app/(app)/crm/installations/page.tsx",
  // Cluster 5A.7.b — Ficha de Instalación (CrmInstallationDetailClient,
  // 3.002 líneas) migrada granularmente al DS v3 en color drift +
  // EmptyState + Tag patterns. 43 hex hardcoded eliminados
  // (status-ok/warn/info/danger), 9 EmptyState legacy migrados al
  // export DS v3, 5 status spans custom (Noche/Día, postulante/
  // seleccionado/contratado/te/inactivo) → <Tag variant>, mapa
  // LIFECYCLE_COLORS string→className → LIFECYCLE_VARIANT
  // string→TagVariant. Toggles nocturno (indigo→info) y chat
  // (teal→ok) ahora con tokens semánticos. Banners verde URL
  // rondas / azul info GPS / amber "guardia ya asignado" /
  // verde quote source / amber "atención" cuenta inactiva
  // alineados a status-* tokens. Net amounts (líquido) y score
  // colors (encuestas) con text-status-*-fg.
  //
  // CrmInstallationDetailClient.tsx NO se agrega: mismo criterio que
  // 4A/4B/4C/4D/5A.1/5A.2/5A.3/5A.4/5A.5/5A.6/5A.7.a — el archivo
  // completó su migración granular de color drift + EmptyState + Tag
  // pero sigue teniendo drift legacy fuera de eso (text-[10px]/text-[11px]
  // en chips de slot, eyebrows de DetailField group y RUTs, restantes
  // del 5A.6). Se agregará cuando se haga su pasada de limpieza
  // tipográfica completa en una sub-fase futura.
  // Cluster 5A.8 — Apollo Prospección (último sub-paso del cluster 5A).
  // Migración del page wrapper al patrón hero DS v3 (Sparkles, violet,
  // eyebrow Comercial/Prospección) + limpieza de 3 hex hardcoded en el
  // client (2 links externos LinkedIn/website text-blue-400 →
  // text-status-info-fg, y 1 badge "Engage" emerald hex → <Tag variant=ok>).
  // Cero cambios funcionales: búsqueda, filtros, paginación, créditos
  // Apollo y conversión a lead intactos.
  "src/app/(app)/crm/prospecting/page.tsx",
  "src/components/crm/ApolloProspectingClient.tsx",
  // Cluster 5B.1.a — Pautas pages + clients chicos.
  // Aplica el patrón hero (iconTone emerald, cluster Operaciones) a 6 page
  // wrappers de Pautas (pauta-mensual / pauta-diaria / ppc / refuerzos /
  // turnos-extra / marcaciones) y limpia drift residual post-5B.0 en 5 clients:
  // - OpsPpcClient: REASON_META map bgColor (amber-400/10, emerald-400/10,
  //   yellow-400/10, orange-400/10) → status-{warn,ok}-soft. severityColor
  //   con opacidad arbitraria (red-500/[0.03], amber-500/[0.03]) →
  //   status-soft/30.
  // - OpsRefuerzosClient: 2 status spans custom (yellow-50/red-50) → <Tag
  //   variant>. 1 text-yellow-600 → text-status-warn-fg.
  // - TeTurnosClient: 4 badges custom con combinaciones light/dark hex
  //   (HE/TE, Manual, Refuerzo, días seguidos alert) → <Tag variant>.
  // - OpsMarcacionesClient: 1 bg-orange-500/15 → bg-status-warn-soft.
  // - TeLotesClient: drift = 0, solo se certifica.
  // OpsPautaMensualClient y OpsPautaDiariaClient NO se incluyen — quedan
  // para 5B.1.b por su mapa de tipos de turno (T/V/L/P/PCG/PSG/TE) que
  // requiere decisión arquitectónica de tokens shift-type.
  //
  // OpsPpcClient, TeTurnosClient y OpsMarcacionesClient.tsx (CCs) NO se
  // agregan: mismo criterio que 4A/4B/4C/4D/5A.1..5A.8 — los archivos
  // completaron su migración granular de color drift + Tag pero siguen
  // teniendo drift legacy fuera de eso (text-[10px]/text-[11px] en chips
  // de filtros, badges de items y labels). Se agregarán cuando se haga
  // su pasada de limpieza tipográfica completa en una sub-fase futura.
  "src/app/(app)/ops/pauta-mensual/page.tsx",
  "src/app/(app)/ops/pauta-diaria/page.tsx",
  "src/app/(app)/ops/ppc/page.tsx",
  "src/app/(app)/ops/refuerzos/page.tsx",
  "src/app/(app)/ops/turnos-extra/page.tsx",
  "src/app/(app)/ops/marcaciones/page.tsx",
  "src/components/ops/OpsRefuerzosClient.tsx",
  "src/components/ops/TeLotesClient.tsx",
  // Cluster 5B.1.b — Pauta Mensual + Pauta Diaria (cierre del cluster 5B.1).
  // El mapa SHIFT_COLORS de Pauta Mensual que mapea los 7 tipos de turno
  // (T/V/L/P/PCG/PSG/TE/-) se migra a los 6 tints del DS v3
  // (tint-emerald/teal/amber/rose/violet/sky), explícitamente diseñados
  // para categorías con HSL light/dark consistent. API SHIFT_COLORS
  // preservada — solo cambian los valores. Adicionalmente se elimina drift
  // residual post-5B.0 en ambos archivos (33 hex en Mensual + 6 en Diaria):
  // banners cyan, indicadores rose/amber/cyan, execution badges, legend,
  // toggle de asistencia, card border GPS fuera_rango → tokens semánticos
  // status-* / tint-* / bg-muted. Cero cambios funcionales.
  //
  // OpsPautaMensualClient.tsx y OpsPautaDiariaClient.tsx NO se agregan a
  // MIGRATED_PATHS: mismo criterio que 4A/4B/4C/4D/5A.1..5A.8/5B.1.a — los
  // archivos completaron su migración granular de color drift + SHIFT_COLORS
  // pero siguen teniendo drift tipográfico legacy fuera de eso (text-[10px]/
  // text-[11px] en celdas de la grilla, badges, legend chips y serie modal).
  // Se agregarán cuando se haga su pasada de limpieza tipográfica completa
  // en una sub-fase futura.
  // Cluster 5B.2.a — Rondas Dashboard + Centro IA (primer sub-step del
  // cluster 5B.2). Migra 2 page wrappers al patrón hero (iconTone emerald,
  // ShieldCheck para /ops/rondas y Sparkles para /ops/rondas/centro-ia) y
  // limpia 25 hex hardcoded residuales en RondasDashboardGlobal.tsx:
  // - STATUS_BG hovers hex-específicos (emerald/amber/red/blue-500/30) →
  //   hover:brightness-110 (patrón unificado DS v3). 'pendiente' →
  //   bg-muted/border (más neutral).
  // - Badges categóricos "Libre" (adHoc, 3 instancias) y "Programada/Prog."
  //   (2 instancias) → tint-violet / tint-sky (patrón consistente con
  //   SHIFT_COLORS de Pauta Mensual).
  // - Audio icon (Mic) purple-400 → text-status-info-fg (consistente con
  //   foto Camera al lado).
  // - Banner "Comentario del guardia" yellow-800/950 → status-warn-*.
  // - Heat map de compliance: 7 niveles con cyan/red/amber/yellow/lime/
  //   emerald → 5 niveles con status-{danger,warn,ok}-*. Lime intermedio
  //   eliminado para claridad.
  // - Preset selector activo cyan-500/20 → status-info-soft.
  // - 5 highlights "is today" en calendar bg-cyan-500/5 → bg-status-info-soft/30.
  // - Ring de selección ring-cyan-400/60 → ring-status-info-border.
  // Cero cambios funcionales: click handlers, hovers, drill-downs, preset
  // selection, custom date range — todo igual.
  //
  // NO TOCADO en este sub-step:
  // - Hex hardcoded de "dashboard mode dark" (#0a0e1a, #1a1f2e, #94a3b8,
  //   #f1f5f9, #64748b, #111827) — Bloomberg-style intencional.
  // - Lógica y cálculos: compliance, completion, alertCount, incidentCount.
  // - RondasSubnav (componente compartido — sub-step futuro si tiene drift propio).
  //
  // Solo las 2 SC pages se agregan: ambas quedan 100% limpias tras la
  // migración a <PageHero>. Los 5 CCs (RondasDashboardClient, RondasDashboardGlobal,
  // IaRecommendations, IaUmbralesConfig, RondasCentroIaClient) NO se agregan:
  // mismo criterio que 4A/4B/4C/4D/5A.1..5A.8/5B.1.a/5B.1.b — los archivos
  // completaron su migración granular de color drift pero siguen teniendo
  // drift tipográfico legacy fuera de eso (text-[10px]/text-[11px] en cells
  // de grilla, badges de tipo, summary chips, eyebrows). Se agregarán cuando
  // se haga su pasada de limpieza tipográfica completa en una sub-fase futura.
  "src/app/(app)/ops/rondas/page.tsx",
  "src/app/(app)/ops/rondas/centro-ia/page.tsx",
  // Cluster 5B.2.b.1 — Monitoreo Grid + componentes compartidos
  // (primer sub-step del Monitoreo de Rondas). Migra los 5 archivos
  // foundationales del Monitoreo en tiempo real:
  // - StatusBadge: STATUS_CONFIG dots (bg-blue/green/red/amber-400) →
  //   bg-status-{info,ok,danger,warn}. completada.border (green-500/20)
  //   → status-ok-border. 'no_realizada' preservado con hex #64748b +
  //   white/5/10 (color neutro intencional del estado "no realizada").
  // - CoverageChip: STATUS_BAR_COLOR map (emerald/blue/red-400) → status-*.
  //   'reemplazo' (purple-400) → tint-violet-fg (categórico tipo "EXTRA",
  //   consistente con SHIFT_COLORS de Pauta Mensual). Hovers con
  //   opacidades arbitrarias (/[0.08], /[0.12], /[0.15]) → /30, /50.
  // - MonitoreoTurnoHeader: trustBorder() hex /25 /8 → status-*-soft + border.
  //   Iniciar turno button (cyan-600/700) → bg-status-info hover:brightness-110.
  //   EN VIVO ping (emerald-400) → status-ok. KPI chips → status-* tokens.
  //   Action button text (red-400/70) → status-danger-fg/70.
  // - MonitoreoGrid: trustBg() hex /12 /25 → status-*-soft + border.
  //   getCellState() 5 cases (omitida, pendiente+past, future expected,
  //   completada manual, omitida manual) → status-*-soft/border con
  //   opacidades estándar /30, /50. rowBg, current slot highlight, live
  //   indicator, action button hover, textarea focus, tab activo →
  //   status-{danger,info}-* tokens.
  // - mobile/CoverageSummary: 2 hex bg-amber-400 → bg-status-warn.
  //
  // Archivos NO migrados aún en este cluster (vienen en 5B.2.b.2): GuardPanel,
  // MonitoreoSidePanel, MonitoreoGuardPanel, MonitoreoGridCellModal,
  // RondasMonitoreoClient, MobileMonitorView, MobileInstallationCard,
  // InstallationDetailModal, alerta-card, PanicAlertBanner, CoberturaSheet,
  // CerrarTurnoModal, monitoreo-map.
  //
  // NO TOCADO: hex de "dashboard mode" (#0a0f1c, #1a1f2e, #64748b, #94a3b8,
  // #f1f5f9, #475569) — Bloomberg-style intentional dark. Lógica de polling,
  // trust score, coverage status, KPI updates, modales intactos.
  //
  // Los 5 CCs NO se agregan a MIGRATED_PATHS: mismo criterio que
  // 4A/4B/4C/4D/5A.1..5A.8/5B.1.a/5B.1.b/5B.2.a — los archivos completaron su
  // migración granular de color drift + STATUS_CONFIG/STATUS_BAR_COLOR/
  // trustBg/getCellState pero siguen teniendo drift tipográfico legacy fuera
  // de eso (text-[10px]/text-[11px] en cells de la grilla, KPI chips,
  // CoverageChip bars, mobile labels). Se agregarán cuando se haga su pasada
  // de limpieza tipográfica completa en una sub-fase futura.
  // Cluster 5B.2.b.2 — Monitoreo paneles + modales + mobile (cierra el
  // cluster 5B.2.b). Migra los 13 archivos restantes del Monitoreo de
  // Rondas, eliminando 80 hex residuales:
  // - GuardPanel: card border condicional (red/emerald-500/[0.05]) →
  //   status-{danger,ok}-soft/30. PPC unassigned card (amber-500/[0.05]) →
  //   status-warn-soft/30. Botón "Asignar guardia" (amber-600) →
  //   status-warn. Badge "EXTRA" (purple-500/20) → tint-violet
  //   (categórico, consistente con "Refuerzo" en SHIFT_COLORS y "Libre"
  //   en RondasDashboardGlobal). Inputs/textarea focus borders
  //   (focus:border-teal-500) → status-info-border. Botón "Ahora"
  //   (bg-teal-500/20) → bg-status-info-soft. Bordes top de secciones
  //   (border-red/emerald-500/10) → status-{danger,ok}-border/40. Texts
  //   "Alerta máxima" / "Buscar reemplazo" → status-{danger,ok}-fg/70.
  //   Dot rojo "puesto descubierto" + dot verde "reemplazado por" →
  //   status-{danger,ok}. Botón "Extra" toggle (purple-600) →
  //   tint-violet-fg. Botón "Agregar guardia" border ramas duplicadas
  //   (teal-500/20 vs status-info-border) → unificadas a status-info-border.
  // - MonitoreoSidePanel: tab indicator (cyan-400) → status-info. Live
  //   ping (emerald-400) + slot dots (red/emerald-400) + Check icon
  //   (emerald-400/40) + semaforo (3 cases) → status-{ok,warn,danger}.
  //   Selected row (cyan-500/[0.04] + border-l-cyan-400) →
  //   status-info-soft/30 + border-l-status-info. Hover red-500/30 →
  //   brightness-110.
  // - MonitoreoGuardPanel: border-cyan-500/20 → status-info-border.
  // - MonitoreoGridCellModal: guardiaName (cyan-400/70) → status-info-fg/70.
  //   Banner border (teal-500/20) → status-info-border. Selected ring
  //   colors (3 cases: emerald/red/amber-500/30 + ring-{color}-500/50)
  //   → status-{ok,danger,warn}-soft + ring-status-{ok,danger,warn}-border.
  //   Inputs focus (focus:border-teal-500) → status-info-border.
  // - RondasMonitoreoClient: admin warning (amber-400/70) →
  //   status-warn-fg/70. Banner "Operando turno" (cyan-500/3 +
  //   border-b-cyan-500/10 + text-cyan-400/50) → status-info-{soft/30,
  //   border/40, fg/50}. 2 hover buttons (cyan-500/8 + cyan-500/20 +
  //   cyan-400/70 + hover variants) unificados a status-info-{soft,
  //   border, fg/70} + brightness-110.
  // - MobileMonitorView: active tab border (teal-400) → status-info.
  //   Selected pill (teal-500/20 + ring-teal-500/30) → status-info-soft +
  //   ring-status-info-border. Descubierta/parcial bg
  //   (red/amber-500/[0.0X]) → status-{danger,warn}-soft/30.
  // - MobileInstallationCard: en_camino dot (amber-400) → status-warn.
  //   Parcial bar dot (amber-400) → status-warn. Trust score gradient
  //   (3 levels: emerald/amber/red-500/8) → status-{ok,warn,danger}-soft
  //   con /50 para los 'completada' / 'isCurrent' / 'isPast'. Strikethrough
  //   text-red-400/60 → status-danger-fg/60. Descubierta bg
  //   (red-500/[0.06]) → status-danger-soft/30. Notes texts
  //   (amber-400/70 y /80) → status-warn-fg/70 y /80.
  // - InstallationDetailModal: badge "Reemplazo" border (cyan-500/20) →
  //   status-info-border. Selected card (border-l-cyan-500 + bg-cyan-500/5)
  //   → border-l-status-info + bg-status-info-soft/30.
  // - alerta-card: SEVERITY_CONFIG (3 levels: critical/warning/info) con
  //   dot/border-l/bg → all status-{danger,warn,info}-* tokens
  //   (eliminando cyan-400/cyan-500 distintivo del nivel info, ahora
  //   azul standard). Checkbox de selección (bg-cyan-500 +
  //   border-cyan-500 + hover:border-cyan-500/50) → status-info-{base,
  //   border}.
  // - CoberturaSheet: coberturaColor() (4 cases: completa/parcial/
  //   descubierta/default) bg fields (emerald/amber/red-500/8) →
  //   status-{ok,warn,danger}-soft/50. Texto rojo (red-400/70) →
  //   status-danger-fg/70. Botón "Enviar" nocturno (indigo-600) →
  //   status-info, diurno (amber-600) → status-warn (consistente con
  //   semantics nocturno=azul, diurno=amber del toggle nocturno/diurno
  //   en installations).
  // - CerrarTurnoModal: 3 textos legacy (amber-200/70, red-200/70,
  //   emerald-300/60) → status-{warn,danger,ok}-fg/{70,70,60}.
  // - monitoreo-map: badge "EN VIVO · 30s" (bg-emerald-500/90) →
  //   bg-status-ok. Legend dot "Marcado" (bg-emerald-400) → bg-status-ok.
  //   Legend line "Recorrido" (bg-emerald-400/80) → bg-status-ok/80.
  //
  // EXCEPCIÓN INTENCIONAL — PanicAlertBanner:
  // Conserva sus rojos hex (red-900, red-800, red-200, red-800/60)
  // porque es una alarma operativa de máxima urgencia (botón de pánico
  // de un guardia activo). Migrar a status-danger-soft reduciría el
  // efecto visual de "alarma roja" y el banner perdería su función
  // semántica. Marker @ds-allow-legacy agregado al inicio del archivo
  // para que el sweep futuro no lo toque.
  //
  // NO TOCADO: hex de "dashboard mode" (#0a0f1c, #1a1f2e, #64748b,
  // #94a3b8, #f1f5f9, #475569). bg-slate-*, bg-zinc-* — neutros.
  // Lógica de polling, trust score, coverage status, KPI updates,
  // modales, click handlers, drag, navegación entre tabs/views.
  //
  // Los 12 CCs migrados (GuardPanel, MonitoreoSidePanel, MonitoreoGuardPanel,
  // MonitoreoGridCellModal, RondasMonitoreoClient, MobileMonitorView,
  // MobileInstallationCard, InstallationDetailModal, alerta-card,
  // CoberturaSheet, CerrarTurnoModal, monitoreo-map) NO se agregan a
  // MIGRATED_PATHS: mismo criterio que 4A/4B/4C/4D/5A.1..5A.8/5B.1.a/
  // 5B.1.b/5B.2.a/5B.2.b.1 — los archivos completaron su migración granular
  // de color drift pero siguen teniendo drift tipográfico legacy fuera de
  // eso (text-[10px]/text-[11px] en cells, badges, eyebrows, legend chips,
  // panel rows). Se agregarán cuando se haga su pasada de limpieza
  // tipográfica completa en una sub-fase futura. PanicAlertBanner queda
  // exempt vía marker @ds-allow-legacy en línea 1.
  //
  // Cluster 5B.2.c — Rondas Reportes + Alertas + Configuración
  // (último sub-step del cluster 5B.2). Migra los 3 page wrappers
  // restantes al patrón hero (iconTone emerald, BarChart3 / BellRing /
  // Settings) y limpia 33 hex residuales en 8 componentes:
  // - RondasReportesTable: STATUS_CONFIG 'cerrada_auto' (orange-500/15)
  //   → status-warn-soft. trustBg() function 3 borders (blue/amber/red-
  //   500/25) → status-{info,warn,danger}-border. BREAKDOWN_COLORS
  //   'speed' (purple-500) → tint-violet-fg (categórico). Banner overlap
  //   warning (border-orange-500/40 + bg-orange-950/20 + textos
  //   orange-300/orange-400) → status-warn-{border,soft/50,fg/{80,60}}.
  //   Audio Mic icons (purple-400) → status-info-fg (consistente con
  //   5B.2.a, unificado con photo Camera). Status incidente 'asignado'
  //   (purple-500/15) → tint-violet (categórico). Banner "Comentario
  //   del guardia" (yellow-800/40 + yellow-950/20 + yellow-500/80) →
  //   status-warn-{border,soft/50,fg/80}. Hover buttons (teal-500/25,
  //   blue-500/25) → brightness-110.
  // - RondasReporteInstalacion: heat-map cell con completadas
  //   (orange-500/15 + orange-500/20) → status-warn-soft + border.
  //   Legend swatch idem. Hover button teal-500/25 → brightness-110.
  // - RondasReportesAlertas: ALERT_TYPE_CONFIG 'ronda_no_realizada'
  //   (orange-500/15) → status-warn-soft. 'checkpoint_omitido'
  //   (purple-500/15 + purple-400) → tint-violet (categórico). Notas
  //   resolución (emerald-400/70) → status-ok-fg/70.
  // - RondasReportesPorGuardia: trust gradient cards 2 borders
  //   (blue/amber-500/25) → status-{info,warn}-border.
  // - RondasAlertasClient: dot bullet legend (cyan-400) → status-info.
  // - RondasConfiguracionClient: step done badge (green-500/20) →
  //   status-ok-soft. Active step border (green-500/20) →
  //   status-ok-border. [#2dd4bf] wizard accent PRESERVADO
  //   intencionalmente (color brand específico del wizard, 10
  //   instancias).
  // - trust-score-badge: 3 borders por nivel (emerald/amber/red-400/30)
  //   → status-{ok,warn,danger}-border.
  // - checkpoint-tasks-editor: tipo 'select' (purple-500/30 +
  //   purple-500) → tint-violet-fg/30 + tint-violet-fg (categórico,
  //   junto con text/number/photo).
  //
  // 8 archivos ya limpios post-5B.0 — solo se certifican aquí:
  // RondasReportesClient, RondasReportesHeatmap, RondasComplianceChart,
  // RondasTrustTrendChart, AlertDistributionChart, TrustScoreGauge,
  // checkpoint-form, checkpoint-qr-generator.
  //
  // Decisiones arquitectónicas (consistentes con sub-steps anteriores):
  // - Audio Mic icon → status-info-fg (5B.2.a establece patrón).
  // - Categóricos especiales (asignado, CP omitido, speed, select) →
  //   tint-violet (familia tints, consistente con "Libre" en
  //   RondasDashboardGlobal y "Refuerzo" en SHIFT_COLORS).
  // - [#2dd4bf] del wizard de Configuración preserved como accent
  //   color brand específico del wizard.
  // - Trust score gradients en 3 archivos: 3-level (≥85 ok, ≥70 info,
  //   ≥50 warn, <50 danger) con status-* tokens, light/dark consistent.
  //
  // NO TOCADO en este sub-step:
  // - Hex hardcoded de "dashboard mode" (#0a0f1c, #1a1f2e, #94a3b8,
  //   #f1f5f9, #64748b, #475569, #1e293b, #111827).
  // - [#2dd4bf] en RondasConfiguracionClient (wizard brand accent).
  // - 8 already-clean components (solo certificación).
  // - 3 redirect pages (checkpoints, programacion, templates).
  // - RondasSubnav (componente compartido).
  //
  // Cero cambios funcionales: filtros, modales, fetch, mutations, drag
  // de checkpoints, charts, tab navigation, wizard wizard de 3 pasos,
  // CRUD de checkpoints/plantillas/programación, QR generator — todo igual.
  //
  // CIERRE DEL CLUSTER 5B.2 (Rondas) — todo el módulo alineado al DS v3.
  // Próximo cluster: 5B.3 (Tickets) — ~3-4 h.
  //
  // Solo las 3 SC pages se agregan: las tres quedan 100% limpias tras la
  // migración a <PageHero>. Los 16 CCs (RondasReportesClient,
  // RondasReportesTable, RondasReporteInstalacion, RondasReportesHeatmap,
  // RondasReportesAlertas, RondasReportesPorGuardia, RondasAlertasClient,
  // RondasConfiguracionClient, RondasComplianceChart, RondasTrustTrendChart,
  // AlertDistributionChart, TrustScoreGauge, trust-score-badge,
  // checkpoint-form, checkpoint-qr-generator, checkpoint-tasks-editor) NO se
  // agregan a MIGRATED_PATHS: mismo criterio que 4A/4B/4C/4D/5A.1..5A.8/
  // 5B.1.a/5B.1.b/5B.2.a/5B.2.b.1/5B.2.b.2 — los archivos completaron su
  // migración granular de color drift pero siguen teniendo drift tipográfico
  // legacy fuera de eso (text-[10px]/text-[11px] en cells de la tabla,
  // badges, eyebrows, legend chips, wizard steps). Se agregarán cuando se
  // haga su pasada de limpieza tipográfica completa en una sub-fase futura.
  "src/app/(app)/ops/rondas/reportes/page.tsx",
  "src/app/(app)/ops/rondas/alertas/page.tsx",
  "src/app/(app)/ops/rondas/configuracion/page.tsx",

  // Cluster 5B.3 — Tickets (módulo completo).
  // Migra los 2 page wrappers al patrón hero (iconTone emerald,
  // TicketCheck) y limpia 12 hex residuales en 5 componentes:
  //
  // - TicketsClient (3 hex): banner "Hallazgo de supervisión"
  //   text-amber-400/80 + text-amber-200/90 → status-warn-fg/*
  //   (consistente en contexto warm); guardia RUT inline
  //   text-blue-400/60 → status-info-fg/60.
  // - TicketDetailClient (4 hex): card guardia RUT/code y
  //   ChevronRight (text-blue-400/*) → status-info-fg/*; botón
  //   "Sin asignar" bg-yellow-500/5 → bg-status-warn-soft/30 y
  //   "Asignar" label text-yellow-500/60 → status-warn-fg/60.
  // - TicketsKanban (2 hex): KANBAN_COLUMNS "waiting"
  //   bg-purple-500 → bg-tint-violet-fg (categórico workflow,
  //   consistente con "Libre"/"Refuerzo"/"asignado"/etc.); icon
  //   UserCircle "sin asignar" text-yellow-500/50 → status-warn-fg/50.
  // - TicketsDashboard (1 hex): item unassigned en lista
  //   bg-yellow-500/20 → bg-status-warn-soft + border ámbar
  //   (diferenciación visual del SLA proximo, ambos warm).
  // - TicketFindingCard (2 hex): eyebrow text-amber-300/70 →
  //   status-warn-fg/70; guardia code mono text-blue-400/60 →
  //   status-info-fg/60.
  //
  // Decisión arquitectónica:
  // - Kanban "waiting" → tint-violet-fg (categórico workflow,
  //   patrón consistente con todos los categóricos especiales del
  //   proyecto: "asignado", "CP omitido", "EXTRA", "Refuerzo",
  //   "Libre", "speed", "select").
  //
  // 4 componentes ya limpios de drift de color post-5B.0 — solo se
  // certifican en esta pasada: InstallationTicketCard,
  // TicketApprovalTimeline, TicketsByInstallationMap,
  // TicketsByInstallationView.
  //
  // NO TOCADO en este sub-step:
  // - TicketsSubnav (componente compartido).
  // - Logic, mutations, queries, optimistic updates, polling,
  //   kanban drag-and-drop, modals, comentarios, SLA tracking,
  //   approval workflow, status changes — todo igual.
  //
  // CIERRE DEL CLUSTER 5B.3 (Tickets) — todo el módulo alineado al
  // DS v3 a nivel de color. Próximo cluster: 5B.4 (Supervisión) — ~2 h.
  //
  // Solo las 2 SC pages se agregan: ambas quedan 100% limpias tras
  // la migración a <PageHero>. Los 9 CCs (TicketsClient,
  // TicketDetailClient, TicketsKanban, TicketsDashboard,
  // TicketFindingCard, InstallationTicketCard, TicketApprovalTimeline,
  // TicketsByInstallationMap, TicketsByInstallationView) NO se agregan
  // a MIGRATED_PATHS: mismo criterio que 4A/4B/4C/4D/5A.1..5A.8/
  // 5B.1.a/5B.1.b/5B.2.a/5B.2.b.1/5B.2.b.2/5B.2.c — los archivos
  // completaron su migración granular de color drift pero siguen
  // teniendo drift tipográfico legacy fuera de eso (text-[10px]/
  // text-[11px] en badges, eyebrows, chips de guardia, kanban cards,
  // timeline cells, mapas). Se agregarán cuando se haga su pasada de
  // limpieza tipográfica completa en una sub-fase futura.
  "src/app/(app)/ops/tickets/page.tsx",
  "src/app/(app)/ops/tickets/[id]/page.tsx",

  // Cluster 5B.4 — Supervisión (módulo completo).
  // Migra los 7 page wrappers al patrón hero (iconTone emerald, varios
  // íconos por sub-sección) y limpia 9 hex residuales en 3 componentes:
  //
  // - SupervisorAssignmentsClient (1 hex): cell switch "asignado"
  //   bg-emerald-500/80 → bg-status-ok (solid semantic).
  // - Step5Closure (6 hex): 5 asteriscos required text-amber-400/70 →
  //   text-status-warn-fg/70; submit button hover hover:bg-emerald-700
  //   → hover:brightness-110.
  // - SupervisionVisitWizard (2 hex): VRA resume modal icon container
  //   bg-orange-500/20 → bg-status-warn-soft; CTA bg-orange-600 +
  //   hover:bg-status-warn → bg-status-warn + hover:brightness-110.
  //
  // 18 componentes ya limpios de drift de color post-5B.0 — sólo se
  // certifican en esta pasada: PhotoGallery, SupervisionDashboardClient,
  // SupervisionDashboardEnhanced, SupervisionGrilla, SupervisionHallazgos,
  // SupervisionNewVisitFlow, SupervisionReportes, SupervisionReportesClient,
  // SupervisionSubnav, VisitaDetailActions, FindingModal, ResolveFindingModal,
  // SignatureCanvas, Step1CheckIn, Step2Evaluation, Step3Checklist,
  // Step4Evidence, WizardProgress.
  //
  // NO TOCADO en este cluster:
  // - 2 redirect pages (mis-visitas → /historial, reportes → /dashboard).
  // - Logic, mutations, queries, wizard validation, signature canvas,
  //   photo upload, geo-validación, hallazgos workflow, asignaciones
  //   matrix toggle, filtros historial, drag grilla — todo igual.
  //
  // CIERRE DEL CLUSTER 5B.4 (Supervisión) — todo el módulo alineado al
  // DS v3 a nivel de color. Próximo cluster: 5B.5 (Alertas Cobertura) — ~2 h.
  //
  // Sólo las 7 SC pages se agregan: todas quedan 100% limpias tras
  // la migración a <PageHero>. Los 21 CCs (PhotoGallery,
  // SupervisionDashboardClient, SupervisionDashboardEnhanced,
  // SupervisionGrilla, SupervisionHallazgos, SupervisionNewVisitFlow,
  // SupervisionReportes, SupervisionReportesClient, SupervisionSubnav,
  // SupervisorAssignmentsClient, VisitaDetailActions, FindingModal,
  // ResolveFindingModal, SignatureCanvas, Step1CheckIn, Step2Evaluation,
  // Step3Checklist, Step4Evidence, Step5Closure, SupervisionVisitWizard,
  // WizardProgress) NO se agregan a MIGRATED_PATHS: mismo criterio que
  // 4A/4B/4C/4D/5A.1..5A.8/5B.1.a/5B.1.b/5B.2.a/5B.2.b.1/5B.2.b.2/5B.2.c/
  // 5B.3 — los archivos completaron su migración granular de color drift
  // pero siguen teniendo drift tipográfico legacy fuera de eso (text-[10px]/
  // text-[11px] en chips de hallazgo, calendario grilla cells, wizard
  // step indicators, badges de evaluación, pills de estado, asteriscos
  // required, photo gallery captions). Se agregarán cuando se haga su
  // pasada de limpieza tipográfica completa en una sub-fase futura.
  "src/app/(app)/ops/supervision/page.tsx",
  "src/app/(app)/ops/supervision/[id]/page.tsx",
  "src/app/(app)/ops/supervision/asignaciones/page.tsx",
  "src/app/(app)/ops/supervision/dashboard/page.tsx",
  "src/app/(app)/ops/supervision/hallazgos/page.tsx",
  "src/app/(app)/ops/supervision/historial/page.tsx",
  "src/app/(app)/ops/supervision/nueva-visita/page.tsx",
  //
  // Cluster 5B.5 — Alertas Cobertura.
  // Migra el page wrapper raíz al patrón hero (iconTone emerald,
  // Megaphone) y limpia 9 hex residuales en 4 componentes:
  //
  // - AlertaDetalleClient (4 hex): badge categórico "Externo"
  //   bg-purple-500/20 + text-purple-400 + border-purple-500/30 →
  //   bg-tint-violet + text-tint-violet-fg + border-tint-violet-fg/30;
  //   botón confirmar hover hover:bg-emerald-700 → hover:brightness-110;
  //   cell oleada activa border-teal-400 + bg-teal-400/30 →
  //   border-status-info-border + bg-status-info-soft (preserva
  //   animate-pulse); badge categórico repetido en tabla notificaciones
  //   bg-purple-500/20 + text-purple-400 + border-purple-500/30 →
  //   bg-tint-violet + text-tint-violet-fg + border-tint-violet-fg/30.
  // - AlertasCoberturaClient (2 hex): badge categórico "Externo" →
  //   tint-violet; botón crear hover hover:bg-emerald-700 →
  //   hover:brightness-110.
  // - CrearAlertaDialog (1 hex): badge numérico de step en preview
  //   bg-teal-500/20 → bg-status-info-soft.
  // - IndiceGeografico (2 hex): card hover hover:border-teal-500/40 →
  //   hover:border-status-info-border; card alerta urgente
  //   border-orange-500/20 → border-status-warn-border.
  //
  // CountdownTimer ya estaba limpio post-5B.0 — sólo se certifica.
  //
  // NO TOCADO en este cluster:
  // - [alertaId]/page.tsx — no tiene PageHeader propio (lo maneja el
  //   AlertaDetalleClient). Se agrega a MIGRATED_PATHS porque está
  //   limpio (sólo wrapper de auth + render del client).
  // - Notification flow, asignación de guardias, countdown timers,
  //   índice geográfico, mapa — todo igual.
  //
  // CIERRE DEL CLUSTER 5B.5 (Alertas Cobertura) — todo el módulo
  // alineado al DS v3 a nivel de color. Próximo cluster: 5B.6
  // (Control Nocturno) — ~2 h.
  //
  // Sólo se agregan los 2 SC pages + 2 CCs ya 100% limpios
  // (AlertasCoberturaClient, CountdownTimer). Los 3 CCs restantes
  // (AlertaDetalleClient, CrearAlertaDialog, IndiceGeografico) NO se
  // agregan a MIGRATED_PATHS: mismo criterio que 4A/4B/4C/4D/
  // 5A.1..5A.8/5B.1.a/5B.1.b/5B.2.a/5B.2.b.1/5B.2.b.2/5B.2.c/5B.3/
  // 5B.4 — completaron su migración granular de color drift pero
  // siguen teniendo drift tipográfico legacy (text-[10px] en chips
  // categóricos, badges de notificación, leyendas de oleadas, contadores
  // del wizard de creación, captions de cards geográficas). Se agregarán
  // cuando se haga su pasada de limpieza tipográfica completa en una
  // sub-fase futura.
  "src/app/(app)/ops/alertas-cobertura/page.tsx",
  "src/app/(app)/ops/alertas-cobertura/[alertaId]/page.tsx",
  "src/components/ops/alertas-cobertura/AlertasCoberturaClient.tsx",
  "src/components/ops/alertas-cobertura/CountdownTimer.tsx",
  //
  // Cluster 5B.6+7 — Control Nocturno + Asistencia Diaria.
  // Combo de cierre: ambos módulos estaban casi 100% limpios post-5B.0
  // (8 de 10 components con drift de color = 0). Sólo 1 page + 1
  // component requirieron tocarse — 7 hex residuales eliminados en
  // total.
  //
  // - control-nocturno/[id] page (3 hex): banner informativo migrado de
  //   blue-200/blue-50/blue-800/blue-200 → status-info-*; link hover
  //   text-blue-900/text-blue-100 → hover:brightness-110. PageHeader
  //   reemplazado por PageHero (Moon, iconTone emerald) consistente
  //   con el resto de pages ops.
  // - AsistenciaShiftCard (4 hex): 2 badges GPS bg-yellow-500/20 →
  //   bg-status-warn-soft; botón danger states (border-rose-500 +
  //   bg-rose-500/25 + border-rose-500/50 + hover:bg-rose-500/20) →
  //   status-danger-* tokens.
  //
  // Pages redirects (control-nocturno/page.tsx, /kpis/page.tsx) NO se
  // tocaron — son redirects de ~5 líneas a /ops/rondas/monitoreo
  // (módulo deprecado). Igual se agregan a MIGRATED_PATHS porque
  // están limpios (cero drift).
  //
  // Sólo se agregan los 3 SC pages + 2 CCs ya 100% limpios
  // (AsistenciaDiariaClient, ModalMarcarAsistencia). Los 7 CCs
  // restantes (ControlNocturnoKpisCharts, ControlNocturnoKpisClient,
  // OpsControlNocturnoDetailClient, OpsControlNocturnoListClient,
  // AsistenciaHeader, AsistenciaInstallationGroup, AsistenciaShiftCard)
  // NO se agregan a MIGRATED_PATHS: mismo criterio que 4A/4B/4C/4D/
  // 5A.1..5A.8/5B.1.a/5B.1.b/5B.2.a/5B.2.b.1/5B.2.b.2/5B.2.c/5B.3/
  // 5B.4/5B.5 — completaron su migración granular de color drift pero
  // siguen teniendo drift tipográfico legacy (text-[10px]/text-[11px]
  // en chips categóricos, badges GPS/Face ID/PIN/Manual, captions de
  // KPIs, contadores y leyendas de cards). Se agregarán cuando se haga
  // su pasada de limpieza tipográfica completa en una sub-fase futura.
  //
  // CIERRE DEL CLUSTER 5B.6+7 — ambos módulos alineados al DS v3 a
  // nivel de color. Próximo cluster: 5B.8 (ATS Reclutamiento) — ~3 h.
  "src/app/(app)/ops/control-nocturno/page.tsx",
  "src/app/(app)/ops/control-nocturno/[id]/page.tsx",
  "src/app/(app)/ops/control-nocturno/kpis/page.tsx",
  "src/components/ops/asistencia-diaria/AsistenciaDiariaClient.tsx",
  "src/components/ops/asistencia-diaria/modals/ModalMarcarAsistencia.tsx",
  // Cluster 5B.8 — ATS Reclutamiento.
  // 4 pages SC migradas a <PageHero> (Briefcase / BriefcaseBusiness,
  // iconTone emerald). 17 hex residuales eliminados en 3 components:
  //
  // - AtsDashboardClient (4 hex): ESTADO_BADGES map (ACTIVO/PAUSADO/
  //   CERRADO) bg-green-100/yellow-100/red-100 + text-green-700/
  //   yellow-700 → bg-status-ok-soft/warn-soft/danger-soft +
  //   text-status-ok-fg/warn-fg/danger-fg. KPI "Postulantes totales"
  //   icon color text-indigo-600 → text-status-info-fg.
  // - AtsPipelineClient (12 hex): ETAPA_COLORS kanban backgrounds
  //   (POSTULADO bg-gray-100, EN_REVISION bg-blue-50, ENTREVISTA
  //   bg-amber-50, OFERTA bg-purple-50, CONTRATADO bg-green-50) →
  //   bg-muted/50 + bg-status-info-soft/40 + bg-status-warn-soft/40
  //   + bg-tint-violet/40 (categórico workflow, igual que "waiting" en
  //   Tickets) + bg-status-ok-soft/40. FUENTE_COLORS source badges
  //   (6 combinaciones: google_jobs/indeed/computrabajo/base_opai/
  //   portal_guardia/directo) → bg-status-info-soft + bg-tint-violet
  //   (indeed) + bg-status-warn-soft + bg-status-ok-soft + bg-tint-sky
  //   (portal_guardia) + bg-muted, preservando identidad visual por
  //   canal. Drag-over highlight (ring-emerald-500/60 +
  //   bg-emerald-50/60) → ring-status-ok + bg-status-ok-soft/60.
  //   Channel status badges (error bg-red-100 text-red-800 / pendiente
  //   bg-amber-100 text-amber-800) → status-danger-soft/warn-soft +
  //   status-danger-fg/warn-fg.
  // - BneIntegrationCard (1 hex): connected badge bg-green-600 →
  //   bg-status-ok.
  //
  // Pages SC (4) + page de configuración (opai/configuracion/ats —
  // wrapper de AtsConfigClient sin PageHeader propio) se agregan
  // porque quedan 100% limpias post-migración. ExternalJobSearch y
  // FormularioPostulacionAts ya estaban 100% limpios y se certifican.
  //
  // Los 6 CCs restantes (AtsConfigClient, AtsCreateJobClient,
  // AtsDashboardClient, AtsPipelineClient, BneIntegrationCard,
  // ExternalJobCard) NO se agregan a MIGRATED_PATHS: mismo criterio
  // que 4A/4B/4C/4D/5A.1..5A.8/5B.1.a/5B.1.b/5B.2.a/5B.2.b.1/5B.2.b.2/
  // 5B.2.c/5B.3/5B.4/5B.5/5B.6+7 — completaron su migración granular
  // de color drift pero siguen teniendo drift tipográfico legacy
  // (text-[10px]/text-[11px] en badges de canales, chips de estado,
  // captions de KPIs, leyendas de pipeline). Se agregarán cuando se
  // haga su pasada de limpieza tipográfica completa en una sub-fase
  // futura.
  //
  // CIERRE DEL CLUSTER 5B.8 (ATS Reclutamiento) — todo el módulo
  // alineado al DS v3 a nivel de color. Próximo cluster: 5B.9
  // (Guardias) — ~3-4 h.
  "src/app/(app)/ops/ats/page.tsx",
  "src/app/(app)/ops/ats/nuevo/page.tsx",
  "src/app/(app)/ops/ats/[jobId]/page.tsx",
  "src/app/(app)/ops/ats/[jobId]/editar/page.tsx",
  "src/app/(app)/opai/configuracion/ats/page.tsx",
  "src/components/ats/ExternalJobSearch.tsx",
  "src/components/ats/FormularioPostulacionAts.tsx",
  // Cluster 5B.9 — Guardias (Personas).
  // Primer sub-step del cluster Personas. Establece iconTone='sky' para
  // todo el cluster (diferenciado de Operaciones emerald). 3 hex
  // residuales eliminados en 2 components:
  //
  // - GuardiasClient (2 hex): warning badge ProfileIncompleteBadge
  //   (bg-amber-100 + dark:amber-900/30 + amber-300/50 + amber-700/50)
  //   → unified bg-status-warn-soft + border-status-warn-border
  //   (light/dark consistent). WhatsApp link badge (bg-green-600/15 +
  //   hover:bg-green-600/25) → bg-status-ok-soft + hover:brightness-110.
  // - GuardiaDetailClient (1 hex): Brain icon de la sección psicolaboral
  //   (text-purple-500) → text-tint-violet-fg (categórico, consistente
  //   con el resto del proyecto).
  //
  // 4 pages SC migradas a <PageHero> (Users / UserPlus / Wallet,
  // iconTone sky). [id]/page.tsx no tiene PageHeader propio (lo maneja
  // GuardiaDetailClient) y queda 100% limpia, se agrega para certificar.
  //
  // Los 2 CCs (GuardiasClient, GuardiaDetailClient) NO se agregan a
  // MIGRATED_PATHS: mismo criterio que 4A/4B/4C/4D/5A.1..5A.8/5B.1.a/
  // 5B.1.b/5B.2.a/5B.2.b.1/5B.2.b.2/5B.2.c/5B.3/5B.4/5B.5/5B.6+7/5B.8 —
  // completaron su migración granular de color drift pero siguen
  // teniendo drift tipográfico legacy (text-[10px]/text-[11px] en
  // badges de lifecycle, ETT chips, listas tabulares). Se agregarán
  // cuando se haga su pasada de limpieza tipográfica completa en una
  // sub-fase futura.
  "src/app/(app)/personas/guardias/page.tsx",
  "src/app/(app)/personas/guardias/[id]/page.tsx",
  "src/app/(app)/personas/guardias/ingreso-te/page.tsx",
  "src/app/(app)/personas/guardias/sueldos-rut/page.tsx",
  // Cluster 5B.10 — Onboarding (cierre cluster 5B).
  // Último sub-step del cluster 5B. Después de este merge, todo
  // Operaciones + Personas/Guardias está alineado al DS v3.
  //
  // 5 hex residuales eliminados en 2 components:
  //
  // - OnboardingDashboardClient (1 hex): X icon "no completado"
  //   (text-red-500/80) → text-status-danger-fg/80.
  // - OnboardingSection (4 hex): STATUS_BADGES COMPLETADO + step
  //   indicator + connector line + email log "ABIERTO" badge
  //   (bg-green-500/20 ×3, bg-green-500/40 ×1) → bg-status-ok-soft
  //   y bg-status-ok solid para el connector (más nítido).
  //
  // 1 page SC migrada a <PageHero> (Sparkles, iconTone sky,
  // heredado de 5B.9). <Breadcrumbs> separado removido — el eyebrow
  // del PageHero lo reemplaza.
  //
  // Los 2 CCs (OnboardingDashboardClient, OnboardingSection) NO se
  // agregan a MIGRATED_PATHS: mismo criterio que 4A/4B/4C/4D/
  // 5A.1..5A.8/5B.1.a/5B.1.b/5B.2.a/5B.2.b.1/5B.2.b.2/5B.2.c/5B.3/
  // 5B.4/5B.5/5B.6+7/5B.8/5B.9 — completaron su migración granular
  // de color drift pero siguen teniendo drift tipográfico legacy
  // (text-[10px]/text-[11px] en headers de tabla, badges de estado,
  // labels de tarjetas). Se agregarán cuando se haga su pasada de
  // limpieza tipográfica completa en una sub-fase futura.
  "src/app/(app)/personas/onboarding/page.tsx",
  // Cluster 5C.1 — Portal Guardia + Rondas mobile.
  // Primer sub-step del cluster 5C (Portales). El más grande del proyecto
  // en cantidad de hex eliminados (~110 hex en 19 archivos).
  //
  // Excepciones intencionales preservadas con marker @ds-allow-legacy:
  // - PanicoModal (8 hex): rojos de alarma operativa de máxima urgencia.
  // - RondasPortalClient L575 (bg-red-900): banner de pánico activo
  //   (consistente con PanicoModal y PanicAlertBanner del Monitoreo).
  // - ChatGuardSection L491 (bg-[#2dd4bf]): accent teal del chat,
  //   identidad visual intencional (similar al wizard de Rondas).
  //
  // Estados categóricos migrados a tint-violet (consistente con proyecto):
  // - VistaPostulante 'ENTREVISTA', GuardPortalClient 'anexo' category,
  //   CheckpointMarker tarea badges, ActiveCheckpointCard tarea labels,
  //   GuardDesempenoSection 'sistema_digital' dimension, RondaCompletada
  //   anomaly badges.
  //
  // Hovers + active states unificados:
  // - hover:bg-X-700 → hover:brightness-110
  // - active:bg-X-800 → active:brightness-95
  //
  // Cero cambios funcionales: geolocalización, scan QR, foto capture,
  // panic button, GPS, marcaciones offline, sync — todo intacto.
  //
  // Los 8 CCs siguientes NO se agregan a MIGRATED_PATHS: mismo criterio
  // que 4A/4B/4C/4D/5A.1..5A.8/5B.1.a/5B.1.b/5B.2.a/5B.2.b.1/5B.2.b.2/
  // 5B.2.c/5B.3/5B.4/5B.5/5B.6+7/5B.8/5B.9/5B.10 — completaron su
  // migración granular de color drift pero siguen teniendo drift
  // tipográfico legacy (text-[10px]/text-[11px] en badges, captions,
  // labels mobile). Se agregarán cuando se haga su pasada de limpieza
  // tipográfica completa en una sub-fase futura:
  // - ChatGuardSection, GuardDesempenoSection, GuardPortalClient,
  //   VistaPostulante, CheckpointMarker, GuardSelectorHeader,
  //   PortalPerfil, RondaActiva.
  "src/components/portal/AlertasCoberturaGuardiaSection.tsx",
  "src/components/portal/ChatGuardPortal.tsx",
  "src/components/portal/LogoutPinModal.tsx",
  "src/components/portal/MisDatosSection.tsx",
  "src/components/portal/SwitchPortalButton.tsx",
  "src/components/portal/TerrenoModeSwitcher.tsx",
  "src/components/portal/rondas/ActiveCheckpointCard.tsx",
  "src/components/portal/rondas/AutoMarkToast.tsx",
  "src/components/portal/rondas/ChatRondasPortal.tsx",
  "src/components/portal/rondas/DevicePairingScreen.tsx",
  "src/components/portal/rondas/GpsStatusIndicator.tsx",
  "src/components/portal/rondas/HistorialRondaModal.tsx",
  "src/components/portal/rondas/LoginScreen.tsx",
  "src/components/portal/rondas/MisRondas.tsx",
  "src/components/portal/rondas/PanicoModal.tsx",
  "src/components/portal/rondas/PhotoCapture.tsx",
  "src/components/portal/rondas/PortalBottomNav.tsx",
  "src/components/portal/rondas/ProgressRing.tsx",
  "src/components/portal/rondas/QrScanner.tsx",
  "src/components/portal/rondas/ReportarIncidente.tsx",
  "src/components/portal/rondas/RondaCompletada.tsx",
  "src/components/portal/rondas/RondaMap.tsx",
  "src/components/portal/rondas/RondaProgress.tsx",
  "src/components/portal/rondas/RondasPortalClient.tsx",
  "src/components/portal/rondas/ServiceWorkerRegistrar.tsx",
  "src/components/portal/rondas/tour/GuardTourOverlay.tsx",
  "src/components/portal/guardia/GuardiaBottomNav.tsx",
  "src/app/portal/guardia/page.tsx",
  "src/app/portal/guardia/layout.tsx",
  "src/app/portal/rondas/page.tsx",
  "src/app/portal/rondas/layout.tsx",
  // Cluster 5C.2 — Portal Cliente raíz.
  // Segundo sub-step del cluster 5C (Portales). 24 componentes, 80 hex
  // residuales eliminados con el catálogo consolidado del proyecto.
  //
  // Estados categóricos migrados a tint-violet (consistente con proyecto):
  // - PortalInstallationDetail Trust Score.
  // - PortalMarcaciones face_id method.
  //
  // Los 26 CCs siguientes NO se agregan a MIGRATED_PATHS: mismo criterio
  // que 4A/4B/4C/4D/5A.1..5A.8/5B.x/5C.1 — completaron su migración
  // granular de color drift pero siguen teniendo drift tipográfico legacy
  // (text-[10px]/text-[11px] sin marcas eyebrow, bg-white/N dark-only en
  // algunos casos). Se agregarán cuando se haga su pasada de limpieza
  // tipográfica completa en una sub-fase futura:
  // - CompanyPresentationView, OpaiBadge, PortalAccessControl,
  //   PortalAlertas, PortalClienteNav, PortalCommandPalette,
  //   PortalComparativa, PortalCotizaciones, PortalCreateTicket,
  //   PortalDashboard, PortalDocsFisicosChecklist, PortalDocsOperacionales,
  //   PortalDocumentos, PortalEmpresa, PortalEncuestas,
  //   PortalGuardiasInstalacion, PortalInstallationDetail,
  //   PortalMarcaciones, PortalNosotros, PortalNotificacionesSheet,
  //   PortalProtocolosLista, PortalReportes, PortalRondas, PortalTickets,
  //   PortalUserMenu, RondaMapView.
  "src/components/portal/cliente/InstallationSwitcher.tsx",
  "src/components/portal/cliente/PortalBitacora.tsx",
  "src/components/portal/cliente/PortalConocimientoEquipo.tsx",
  "src/components/portal/cliente/PortalContractForm.tsx",
  "src/components/portal/cliente/PortalDesempeno.tsx",
  "src/components/portal/cliente/PortalEquipamiento.tsx",
  "src/components/portal/cliente/PortalInstallations.tsx",
  "src/components/portal/cliente/PortalPersonal.tsx",
  "src/components/portal/cliente/PortalPosta.tsx",
  "src/components/portal/cliente/PortalProtocolos.tsx",
  "src/components/portal/cliente/PortalSignContract.tsx",
  "src/components/portal/cliente/PreviewBadge.tsx",
  "src/components/portal/cliente/ProtocolSignModal.tsx",
  "src/app/portal/cliente/page.tsx",
  "src/app/portal/cliente/layout.tsx",
  "src/app/portal/cliente/setup/page.tsx",
  "src/app/portal/cliente/forgot-pin/page.tsx",
  "src/app/portal/cliente/seguridad-personal/page.tsx",
  // Cluster 5C.3 — Portal Cliente subdirs.
  // Tercer y último sub-step del cluster 5C (Portales). Cierra el cluster
  // completo. 25 archivos en 6 subdirectorios, 72 hex residuales.
  //
  // Patrón muy frecuente unificado: bg-X-400/10 border-X-400/20 →
  // status-*-soft + status-*-border. Aparece 18+ veces en KPI cards,
  // status badges, tab badges.
  //
  // Cero cambios funcionales: cotización approve/reject, contract
  // signing con sticky notes editables, equipo navigation, guardia
  // detail tabs, bitácora timeline, tour navigation — todo intacto.
  //
  // Los 25 CCs siguientes NO se agregan a MIGRATED_PATHS: mismo criterio
  // que 4A/4B/4C/4D/5A.1..5A.8/5B.x/5C.1/5C.2 — completaron su migración
  // granular de color drift pero siguen teniendo drift tipográfico legacy
  // (text-[10px]/text-[11px] sin marcas eyebrow font-mono uppercase, o
  // bg-white/N dark-only en algunos casos). Se agregarán cuando se haga
  // su pasada de limpieza tipográfica completa en una sub-fase futura:
  // - bitacora/BitacoraEvento, bitacora/BitacoraFiltros,
  //   bitacora/BitacoraTimeline,
  // - cotizaciones/ContratoBorradorView, cotizaciones/CotizacionCard,
  //   cotizaciones/DashboardCotizacionesPendientes,
  //   cotizaciones/ProposalCondiciones, cotizaciones/ProposalDesgloseRecursos,
  //   cotizaciones/ProposalEstructuraCostos, cotizaciones/ProposalHeader,
  //   cotizaciones/ProposalPuestos, cotizaciones/ProposalTecnologia,
  //   cotizaciones/ProposalTotalAcciones,
  // - dashboard/EquipoGlobalCard,
  // - equipo/EquipoGuardiaRow, equipo/EquipoKpiCards,
  //   equipo/PortalEquipoDirectorio,
  // - guardia-detalle/GuardiaHeader, guardia-detalle/TabDesempeno,
  //   guardia-detalle/TabDocumentos, guardia-detalle/TabExamenes,
  //   guardia-detalle/TabInfo, guardia-detalle/TabPsicologico,
  //   guardia-detalle/TabSupervision,
  // - tour/TourOverlay.
  "src/components/portal/cliente/cotizaciones/CompliancePortal.tsx",
  "src/components/portal/cliente/cotizaciones/CotizacionApproveDialog.tsx",
  "src/components/portal/cliente/cotizaciones/CotizacionRejectDialog.tsx",
  "src/components/portal/cliente/cotizaciones/ProposalDetalleServicio.tsx",
  "src/components/portal/cliente/cotizaciones/ProposalManoDeObra.tsx",
  "src/components/portal/cliente/cotizaciones/ProposalServicioIncluye.tsx",
  "src/components/portal/cliente/cotizaciones/WhatsAppButton.tsx",
  "src/components/portal/cliente/dashboard/DocComplianceAlertCard.tsx",
  "src/components/portal/cliente/equipo/EquipoFiltros.tsx",
  "src/components/portal/cliente/equipo/EquipoGrupoInstalacion.tsx",
  "src/components/portal/cliente/guardia-detalle/GuardiaDetalleClient.tsx",
  "src/components/portal/cliente/shared/ExportButton.tsx",
  "src/app/portal/cliente/guardia/[id]/page.tsx",
  // Cluster 5D+5E — Combo Configuración + Docs + Chat. 13 archivos
  // migrados al DS v3 a nivel de color drift (67 hex residuales eliminados).
  //
  // Solo se agregan a MIGRATED_PATHS los 2 archivos que quedan 100% limpios
  // tras la migración de color. Los otros 11 NO se agregan: mismo criterio
  // que 4A/4B/4C/4D/5A.1..5A.8/5B/5C — los archivos completaron su migración
  // granular de color drift pero siguen teniendo drift tipográfico legacy
  // fuera del color (text-[10px]/text-[11px] sin marcas eyebrow). Se
  // agregarán cuando se haga su pasada de limpieza tipográfica completa.
  //
  // - MiPlanClient (16 hex): PLAN_BADGES + estimación banner + plan cards.
  // - ChatNewDmModal (1 hex): avatar circle.
  "src/components/configuracion/MiPlanClient.tsx",
  "src/components/chat/ChatNewDmModal.tsx",
  // Cluster 5F.1 — Payroll. Primer sub-step del cluster Payroll
  // (Liquidaciones y Nómina). Establece iconTone='amber' (ámbar dorado)
  // como convención visual del cluster (diferenciado de Operaciones
  // emerald, Comercial violet, Personas sky).
  //
  // 7 pages migradas al patrón hero (iconTone amber) + 9 hex residuales
  // eliminados en 3 components con drift + 8 components ya limpios
  // certificados. Cero cambios funcionales (liquidaciones, simulator,
  // anticipos, parámetros legales, asistencia, periodos — sin tocar).
  //
  // Solo se agregan a MIGRATED_PATHS los archivos que quedan 100% limpios
  // tras la migración de color (sin drift tipográfico residual). Mismo
  // criterio que 4A/4B/4C/4D/5A/5B/5C/5D+5E — los siguientes archivos
  // completaron su migración granular de color drift pero siguen teniendo
  // drift tipográfico legacy fuera del color (text-[10px]/text-[11px] sin
  // marcas eyebrow). Se agregarán cuando se haga su pasada de limpieza
  // tipográfica completa:
  //   - simulator/page.tsx (1 hex)
  //   - AnticipoProcessClient (1)
  //   - BonosCatalogManager (6)
  //   - GuardiaLiquidacionesTab (6)
  //   - HolidaysManager (2)
  //   - PayrollAsistenciaCierreClient (1)
  //   - PayrollPeriodDetailClient (~30)
  //   - SueldosRutListClient (~13)
  "src/app/(app)/payroll/page.tsx",
  "src/app/(app)/payroll/anticipos/page.tsx",
  "src/app/(app)/payroll/asistencia/page.tsx",
  "src/app/(app)/payroll/parameters/page.tsx",
  "src/app/(app)/payroll/periodos/page.tsx",
  "src/app/(app)/payroll/periodos/[id]/page.tsx",
  "src/components/payroll/PayrollConfigTabs.tsx",
  "src/components/payroll/PayrollParametersEditor.tsx",
  "src/components/payroll/PayrollPeriodListClient.tsx",
  "src/components/payroll/PayrollSubnav.tsx",
  // Cluster 5F.2a — Command Palette + Notifications cleanup. 30 hex
  // residuales eliminados en 6 components con drift; otros 10 components
  // del sistema de notificaciones ya estaban limpios y se certifican.
  //
  // Decisiones arquitectónicas:
  //   - CommandPalette: 'deal' → tint-violet (categórico CRM, consistente
  //     con ChatMessage del 5D+5E). Resto al patrón status-* semántico.
  //   - MODULE_BADGE_STYLES: finanzas → tint-teal (correlación con cluster
  //     5F.2c destino), payroll → tint-amber (correlación con cluster 5F.1),
  //     hub → tint-violet (categórico admin). Resto al status-* semántico.
  //   - System notification highlight unificado a status-warn-soft/30.
  //   - ChatToast avatar palette migrado preservando variedad (4-5 colores).
  //
  // Cero cambios funcionales. Cmd+K search, navigation, mark read, delete,
  // popover, side panel, hub widget, chat toasts — todo igual.
  //
  // Solo se agregan a MIGRATED_PATHS los archivos que quedan 100% limpios
  // tras la migración de color. Mismo criterio que 4A/4B/4C/4D/5A/5B/5C/
  // 5D+5E/5F.1 — los siguientes archivos completaron su migración granular
  // de color drift pero siguen teniendo drift tipográfico legacy fuera del
  // color (text-[10px]/text-[11px] sin marcas eyebrow). Se agregarán cuando
  // se haga su pasada de limpieza tipográfica completa:
  //   - CommandPalette.tsx (8 instancias text-[10px]/text-[11px])
  //   - NotificationListClient.tsx (4)
  //   - NotificationPopover.tsx (6)
  //   - NotificationSidePanel.tsx (12)
  //   - NotificationBell.tsx (2)
  //   - HubNotifications.tsx (1)
  "src/components/opai/command-palette/CommandPaletteProvider.tsx",
  "src/components/opai/CommandPalette.tsx",
  "src/components/opai/NotificationConfigClient.tsx",
  "src/components/opai/UnifiedNotificationPrefsClient.tsx",
  "src/components/notifications/ChatToast.tsx",
  "src/components/notifications/InAppNotificationProvider.tsx",
  "src/components/notifications/NotificationSidePanelContext.tsx",
  "src/components/notifications/SoundSettings.tsx",
  "src/components/pwa/InAppNotificationProvider.tsx",
  "src/components/pwa/NotificationSettings.tsx",
  // Cluster 5F.2c — Finanzas + DT + Cumplimiento. Último cluster temático
  // del proyecto. Establece iconTone='teal' (turquesa) — diferenciado de
  // Payroll (amber) y resto de clusters.
  //
  // 22 pages migradas a <PageHero> con iconTone='teal'. 4 hex residuales
  // eliminados en /finanzas/page.tsx modules array (status-* tokens; 'Pagos'
  // categórico → tint-violet, igual que 'deal' del CRM).
  //
  // Cumplimiento page ya usa <ConfigPageLayout> — solo certificado.
  // /finanzas/pagos/page.tsx es un redirect de 5 líneas — certificado.
  // /reportes/dt/layout.tsx no tiene header — certificado.
  //
  // Cero cambios funcionales: rendiciones, DTE, contabilidad, conciliación,
  // reportes DT, cumplimiento — todo igual.
  //
  // ComplianceConfigClient.tsx NO se agrega a MIGRATED_PATHS: mismo criterio
  // que 4A/4B/4C/4D/5A/5B/5C/5D+5E/5F.1/5F.2a — color drift = 0, pero tiene
  // drift tipográfico legacy (text-[11px] sin marcas eyebrow) que requiere
  // pasada de limpieza tipográfica futura.
  "src/app/(app)/finanzas/page.tsx",
  "src/app/(app)/finanzas/aprobaciones/page.tsx",
  "src/app/(app)/finanzas/bancos/page.tsx",
  "src/app/(app)/finanzas/conciliacion/page.tsx",
  "src/app/(app)/finanzas/contabilidad/page.tsx",
  "src/app/(app)/finanzas/contabilidad/asientos/nuevo/page.tsx",
  "src/app/(app)/finanzas/facturacion/page.tsx",
  "src/app/(app)/finanzas/facturacion/emitir/page.tsx",
  "src/app/(app)/finanzas/facturacion/notas/credito/page.tsx",
  "src/app/(app)/finanzas/facturacion/notas/debito/page.tsx",
  "src/app/(app)/finanzas/pagos/page.tsx",
  "src/app/(app)/finanzas/pagos-proveedores/page.tsx",
  "src/app/(app)/finanzas/proveedores/page.tsx",
  "src/app/(app)/finanzas/rendiciones/page.tsx",
  "src/app/(app)/finanzas/rendiciones/[id]/page.tsx",
  "src/app/(app)/finanzas/rendiciones/nueva/page.tsx",
  "src/app/(app)/finanzas/reportes/page.tsx",
  "src/app/(app)/reportes/dt/page.tsx",
  "src/app/(app)/reportes/dt/layout.tsx",
  "src/app/(app)/reportes/dt/asistencia-diaria/page.tsx",
  "src/app/(app)/reportes/dt/domingos-festivos/page.tsx",
  "src/app/(app)/reportes/dt/jornada-diaria/page.tsx",
  "src/app/(app)/reportes/dt/modificaciones-turnos/page.tsx",
  "src/app/(app)/opai/configuracion/cumplimiento/page.tsx",
  // Cluster 5-final.a — CRM regression + CPQ cleanup.
  // Auditoría post-5F.2c detectó 162 hex residuales (83 CRM + 79 CPQ)
  // introducidos después del cierre del cluster 5A. Consolidados al
  // catálogo estándar status-{ok,warn,danger,info}-* y tint-violet
  // (este último para 'deal'/Negocio en CRM_TYPES y ENTITY_CONFIG).
  // Botones con `hover:bg-X-700` → `hover:brightness-110`. Backgrounds
  // `bg-X-50` (light theme cards en EmailHistoryList y
  // AccountContractsSection) → `bg-status-*-soft` (light/dark consistente).
  //
  // 31 archivos modificados con 0 hex drift restante:
  //   CRM (21): AccountContractsSection, AccountPortalSection,
  //   CrmAccountDetailClient, CrmActivityTimeline, CrmContactDetailClient,
  //   CrmCotizacionesClient, CrmDealDetailClient, CrmGlobalSearch,
  //   CrmInstallationsClient, CrmInstallationsListClient,
  //   CrmLeadDetailClient, CrmSectionCreateButton, DuplicateAccountModal,
  //   EmailHistoryList, InstalacionRondasTab, InstalacionVisitasTecnicasTab,
  //   LeadInstallationCpq, protocol/ExamsSubTab, protocol/ProtocolDocumentsSubTab,
  //   protocol/sections/{AiHelpers, ProtocolAddItemForm, ProtocolAddSection,
  //   ProtocolSectionCard}.
  //   CPQ (10+): AdditionalLinesSection, CpqCatalogConfig, CpqDashboard,
  //   CpqPositionCard, CpqPricingCalc, CpqQuickAddCost, CpqQuoteCosts,
  //   CpqQuoteDetail, CpqQuotesList, CreateQuoteModal, FinancialPanel,
  //   FollowUpDecisionModal, MobileBottomBar, QuoteBreakdownPanel,
  //   QuoteIncludesEditor, QuoteKpiBar, SendPortalProposalModal,
  //   VisitaTecnicaSolicitudModal.
  //
  // Los archivos NO se agregan a MIGRATED_PATHS: mismo criterio que
  // 4A/4B/4C/4D/5A.1..5A.8/5B.1..5B.10/5C/5D+5E/5F.1/5F.2 — los archivos
  // completaron su migración granular de color drift al catálogo DS v3
  // pero siguen teniendo drift tipográfico legacy fuera de eso
  // (text-[10px]/text-[11px] en chips, badges, eyebrows, contadores).
  // Se agregarán cuando se haga su pasada de limpieza tipográfica
  // completa en el cluster 5-final.c (cleanup legacy + strict mode global).
  // Agregar aquí cuando se migren:
  // "src/components/personas/",
  // "src/components/documentos/",
  // Cluster 5-final.b — Admin + Platform + Access Control + Opai + Marketing.
  // Penúltimo PR del proyecto. 33 archivos en 6 zonas con 147 hex residuales
  // consolidados al catálogo estándar status-{ok,warn,danger,info}-* y
  // tint-violet (este último para 'enterprise'/'premium' plan badges,
  // consistente con MiPlanClient en 5D+5E). Botones con `hover:bg-X-700` →
  // `hover:brightness-110`. Backgrounds dark-only (`dark:bg-X-900/...`)
  // consolidados a `bg-status-*-soft` (light/dark consistente).
  //
  // Hot spots:
  //   - platform/TenantAddonsSection (33): PLAN_BADGES + ADDON_CATEGORY_BADGES
  //     + 5 botones azul + sticky note diff + tier comparison cards.
  //   - opai/AiHelpChatWidgetV2 (17+): badges condicionales + gradient AI pill +
  //     cyan/emerald accents. Gradient identidad consolidado a status-info →
  //     status-ok (decisión a revisar visualmente).
  //   - platform/TenantDetailTabs (15): tabs + status badges + buttons.
  //   - access-control/ListValidationResult (15): EXCEPCIÓN @ds-allow-legacy
  //     (alarma operativa de denegar/permitir acceso, rojos intensos
  //     intencionales — mismo patrón que PanicoModal y PanicAlertBanner).
  //   - platform/TenantTable (9), admin/PresentationsList (8): mapping estándar.
  //
  // 33 archivos modificados con 0 hex drift residual:
  //   platform (8): TenantAddonsSection, TenantDetailTabs, TenantTable,
  //     PlatformAiProvidersConfig, PlatformSidebar, CreateTenantForm,
  //     ImpersonateBanner, PlatformKpiCard.
  //   opai (6): AiHelpChatWidgetV2, BottomNav, AiHelpChatWidget,
  //     DocumentosContent, RoleTemplatesClient, FiscalizacionDTButton.
  //   access-control (8): ListValidationResult (con marker), OfflineSyncIndicator,
  //     AccessControlEntry, AccessControlGuardHome, ClientAccessControlLive,
  //     InSiteList, MrzCameraCapture, VehiclePlateOCR.
  //   admin (6): PresentationsList, TemplateSidebar, EmailStatusBadge,
  //     PreviewModeToggle, ConversionChart, DashboardHeader.
  //   marketing (3): HeroSection, ModulesSection, LoginGate.
  //   comunicaciones (2): EmailHistoryClient, TemplateEditorClient.
  //
  // Decisiones consistentes con el catálogo:
  // - 'enterprise' / 'premium' plan badges → tint-violet (igual que MiPlanClient).
  // - ListValidationResult preservada con marker (alarma operativa, mismo
  //   patrón que PanicoModal y PanicAlertBanner).
  // - AiHelpChatWidgetV2 gradient cyan→emerald consolidado a status-info →
  //   status-ok. Si pierde identidad visual del AI, se puede agregar marker
  //   @ds-allow-legacy en revisión visual posterior.
  // - HeroSection (marketing landing) traffic-light dots de mock browser
  //   migrados a status-{danger,warn,ok}/40 (semánticamente equivalentes).
  //
  // Los archivos NO se agregan a MIGRATED_PATHS: mismo criterio que
  // 4A/4B/4C/4D/5A.1..5A.8/5B.1..5B.10/5C/5D+5E/5F.1/5F.2/5-final.a — los
  // archivos completaron su migración granular de color drift al catálogo
  // DS v3 pero siguen teniendo drift tipográfico legacy fuera de eso
  // (text-[10px]/text-[11px] en chips/badges/eyebrows, no-text-white-opacity,
  // no-bg-white-opacity en backdrops). Se agregarán cuando se haga su pasada
  // de limpieza tipográfica completa en el cluster 5-final.c (cleanup
  // legacy + strict mode global + docs finales del DS v3).
];

// ───────────────────────────────────────────────────────────────────
// DS_SOURCE_PATHS — archivos que DEFINEN el design system.
// Aquí se permiten patrones que en código de aplicación serían drift,
// porque el DS toma decisiones que después el resto consume.
//
// Ejemplos legítimos en esta zona (NO en otros archivos):
//   - text-[11px] sin marcas eyebrow (numéricos mono, pills chicos)
//   - tamaños arbitrarios definidos como variants de un componente
//
// Sigue prohibido aquí: text-[10px], colores hardcoded, dark-only.
// ───────────────────────────────────────────────────────────────────
const DS_SOURCE_PATHS = [
  "src/components/opai-ds/Surface.tsx",
  "src/components/opai-ds/SectionHeader.tsx",
  "src/components/opai-ds/PageHero.tsx",
  "src/components/opai-ds/Stat.tsx",
  "src/components/opai-ds/Tag.tsx",
  "src/components/opai-ds/StatusDot.tsx",
  "src/components/opai-ds/IconBubble.tsx",
  "src/components/opai-ds/EmptyState.tsx",
  "src/components/opai-ds/Spinner.tsx",
  "src/components/opai-ds/Skeleton.tsx",
  "src/components/opai-ds/MetricBar.tsx",
  "src/components/opai-ds/Toolbar.tsx",
  "src/components/opai-ds/DataTable.tsx",
  "src/components/opai-ds/DataView.tsx",
  "src/components/opai-ds/HeatGrid.tsx",
  "src/components/opai-ds/Avatar.tsx",
  "src/components/opai-ds/Breadcrumbs.tsx",
  "src/components/opai-ds/KPICard.tsx",
];
// Nota: NO incluye index.ts ni tokens.ts. Esos son barrel/helpers, no
// definen patrones visuales y deben seguir las mismas reglas que app code.

// Carpetas SIEMPRE excluidas (legacy permitido por diseño).
const ALWAYS_EXCLUDED = [
  "src/app/(marketing)/",
  "src/components/templates/",
  "src/components/opai/conocimiento/_primitives.tsx",
  "src/components/ui/",          // shadcn base, no es parte del DS
  "node_modules/",
  ".next/",
  "scripts/",                    // este script y check-pii
];

// ───────────────────────────────────────────────────────────────────
// REGLAS — cada una con un patrón regex y un mensaje
// ───────────────────────────────────────────────────────────────────
//
// Importante: las reglas son del tipo "lo prohibido". Cada regla:
//   - id: identificador corto.
//   - test: regex que detecta la violación. Debe usar `g` para multi-match.
//   - message: explicación humana.
//   - fix: sugerencia de remplazo.
//   - severity: "error" (bloquea en strict) | "warn" (nunca bloquea).
//   - scope: "tsx" | "css" | "any". Filtra a qué archivos aplica la regla.
//

const RULES = [
  // ─── Tipografía mínima ───────────────────────────────────────
  {
    id: "no-tiny-text",
    // text-[10px] siempre prohibido. text-[11px] solo prohibido cuando NO va
    // acompañado de las 3 marcas de eyebrow (font-mono + uppercase + tracking-).
    // Estrategia: detectamos tanto text-[10px] (siempre malo) como text-[11px]
    // y luego en validación per-match revisamos si está dentro del patrón eyebrow.
    test: /text-\[(10|11)px\]/g,
    message: "Tipografía menor a 12px no es legible en mobile.",
    fix: "Usa text-[12px] o text-[13px]. Si es un eyebrow decorativo, agrega font-mono + uppercase + tracking-[0.08em] (ej: text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4).",
    severity: "error",
    scope: "tsx",
    // Función de validación contextual: si retorna true, el match SE PERMITE.
    // Recibe el match, el texto completo del archivo, el índice del match y
    // el path del archivo (opcional, usado para excepciones por zona).
    allowIfContext: (match, content, index, filePath) => {
      // text-[10px] nunca se permite, sin excepciones
      if (match[0] === "text-[10px]") return false;

      // text-[11px] en archivos DS source: permitido (decisión del DS).
      if (filePath && isDsSource(filePath)) return true;

      // text-[11px] en código de aplicación: aceptar SOLO si está en un
      // className que también incluya font-mono + uppercase + tracking-*
      // (las 3 marcas del eyebrow editorial).
      const before = content.lastIndexOf('className="', index);
      if (before === -1) return false;
      const after = content.indexOf('"', index);
      if (after === -1 || after - before > 800) return false;
      const classBlock = content.slice(before, after);

      const hasMono = /\bfont-mono\b/.test(classBlock);
      const hasUpper = /\buppercase\b/.test(classBlock);
      const hasTracking = /\btracking-/.test(classBlock);

      return hasMono && hasUpper && hasTracking;
    },
  },

  // ─── Colores hardcoded (deben ir por token semántico) ────────
  {
    id: "no-hardcoded-emerald",
    test: /\btext-emerald-(300|400|500|600|700)\b/g,
    message: "Color emerald hardcoded.",
    fix: "Usar text-status-ok-fg.",
    severity: "error",
    scope: "tsx",
  },
  {
    id: "no-hardcoded-amber",
    test: /\btext-amber-(300|400|500|600|700)\b/g,
    message: "Color amber hardcoded.",
    fix: "Usar text-status-warn-fg.",
    severity: "error",
    scope: "tsx",
  },
  {
    id: "no-hardcoded-red",
    test: /\btext-red-(300|400|500|600|700)\b/g,
    message: "Color red hardcoded.",
    fix: "Usar text-status-danger-fg.",
    severity: "error",
    scope: "tsx",
  },
  {
    id: "no-hardcoded-blue",
    test: /\btext-blue-(300|400)\b/g,
    message: "Color blue hardcoded.",
    fix: "Usar text-status-info-fg o text-primary según contexto.",
    severity: "error",
    scope: "tsx",
  },
  {
    id: "no-hardcoded-bg-emerald",
    test: /\bbg-emerald-500\/(5|10|15|20)\b/g,
    message: "Background emerald hardcoded.",
    fix: "Usar bg-status-ok-soft.",
    severity: "error",
    scope: "tsx",
  },
  {
    id: "no-hardcoded-bg-amber",
    test: /\bbg-amber-500\/(5|10|15|20)\b/g,
    message: "Background amber hardcoded.",
    fix: "Usar bg-status-warn-soft.",
    severity: "error",
    scope: "tsx",
  },
  {
    id: "no-hardcoded-bg-red",
    test: /\bbg-red-500\/(5|10|15|20)\b/g,
    message: "Background red hardcoded.",
    fix: "Usar bg-status-danger-soft.",
    severity: "error",
    scope: "tsx",
  },
  {
    id: "no-hardcoded-border-emerald",
    test: /\bborder-emerald-500\/(20|30|40|50)\b/g,
    message: "Border emerald hardcoded.",
    fix: "Usar border-status-ok-border.",
    severity: "error",
    scope: "tsx",
  },
  {
    id: "no-hardcoded-border-amber",
    test: /\bborder-amber-500\/(20|30|40|50)\b/g,
    message: "Border amber hardcoded.",
    fix: "Usar border-status-warn-border.",
    severity: "error",
    scope: "tsx",
  },
  {
    id: "no-hardcoded-border-red",
    test: /\bborder-red-500\/(20|30|40|50)\b/g,
    message: "Border red hardcoded.",
    fix: "Usar border-status-danger-border.",
    severity: "error",
    scope: "tsx",
  },

  // ─── White/black opacity (dark-only patterns) ────────────────
  {
    id: "no-text-white-opacity",
    test: /\btext-white\/(40|50|60|70)\b/g,
    message: "text-white/N es dark-only y rompe en light mode.",
    fix: "Usar text-ds-text-3 (secondary) o text-ds-text-4 (tertiary).",
    severity: "error",
    scope: "tsx",
  },
  {
    id: "no-bg-white-opacity",
    test: /\bbg-white\/(02|03|04|05|10)\b/g,
    message: "bg-white/N es dark-only y desaparece en light mode.",
    fix: "Usar bg-ds-surface-1/2/3 según elevación.",
    severity: "error",
    scope: "tsx",
  },

  // ─── Clases dark-only legacy (card-mock, etc.) ───────────────
  {
    id: "no-card-mock",
    test: /\b(card-mock|card-mock-tight)\b/g,
    message: "card-mock es dark-only (rgba(255,255,255,...)).",
    fix: "Usar <Surface elevation={1} padding=...> de @/components/opai-ds.",
    severity: "error",
    scope: "any",
  },
  {
    id: "no-pill-mock",
    test: /\bpill-mock\b/g,
    message: "pill-mock es de Conocimiento (dark-only).",
    fix: "Usar <Tag variant=...> de @/components/opai-ds.",
    severity: "error",
    scope: "any",
  },
  {
    id: "no-bar-mock",
    test: /\bbar-mock\b/g,
    message: "bar-mock es de Conocimiento (dark-only).",
    fix: "Usar <MetricBar value={...}> de @/components/opai-ds.",
    severity: "error",
    scope: "any",
  },

  // ─── Imports prohibidos ──────────────────────────────────────
  {
    id: "no-conocimiento-primitives-import",
    test: /from\s+["']@\/components\/opai\/conocimiento\/_primitives["']/g,
    message: "Import de primitives de Conocimiento prohibido fuera de Conocimiento.",
    fix: "Importar de @/components/opai-ds (Stat, Tag, StatusDot, MetricBar).",
    severity: "error",
    scope: "tsx",
    // Excepción: Conocimiento puede importarse a sí mismo
    pathExclude: /src\/(components\/opai\/conocimiento|app\/.*conocimiento)/,
  },

  // ─── Touch targets — selects y inputs muy chicos ─────────────
  {
    id: "no-h8-input",
    test: /(SelectTrigger|<Input|<input)[^>]*className=["'][^"']*\bh-8\b/g,
    message: "Input/Select con h-8 (32px) es bajo el mínimo Apple HIG (44px) en mobile.",
    fix: 'className="h-10 sm:h-9" (44px mobile, 36px desktop).',
    severity: "warn", // warn porque hay cards-toggle y otros valid uses
    scope: "tsx",
  },

  // ─── OpaiSurface deprecated post-cleanup ─────────────────────
  // (Dejar comentado hasta que terminen TODAS las migraciones.)
  // {
  //   id: "no-opai-surface-legacy",
  //   test: /from\s+["']@\/components\/opai["']/g,
  //   message: "OpaiSurface/OpaiPageHero/OpaiSectionHeader fueron deprecados.",
  //   fix: "Importar de @/components/opai-ds.",
  //   severity: "error",
  //   scope: "tsx",
  // },
];

// ───────────────────────────────────────────────────────────────────
// Resolución de archivos
// ───────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const MODE_ALL = args.includes("--all");
const FORCE_WARN = args.includes("--warn-only");

function getStagedFiles() {
  try {
    const out = execSync("git diff --cached --name-only --diff-filter=ACMR", {
      encoding: "utf8",
    });
    return out.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function getAllRepoFiles() {
  try {
    const out = execSync(
      "git ls-files 'src/**/*.tsx' 'src/**/*.ts' 'src/**/*.css'",
      { encoding: "utf8" },
    );
    return out.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

const files = MODE_ALL ? getAllRepoFiles() : getStagedFiles();

// ───────────────────────────────────────────────────────────────────
// Filtros y clasificación
// ───────────────────────────────────────────────────────────────────

function isExcludedAlways(path) {
  return ALWAYS_EXCLUDED.some((p) => path.startsWith(p) || path === p);
}

function isMigrated(path) {
  return MIGRATED_PATHS.some((p) => path.startsWith(p));
}

function isDsSource(path) {
  return DS_SOURCE_PATHS.includes(path);
}

/**
 * Devuelve una versión del contenido en la que los comentarios JS/TS/CSS
 * se reemplazan por espacios del mismo largo, preservando offsets de
 * caracteres y números de línea. Las reglas regex se aplican sobre esta
 * versión "limpia"; al reportar la línea, los offsets siguen siendo
 * correctos respecto al archivo original.
 *
 * Cubre:
 *   //  comentario hasta fin de línea
 *   / * ... * /  bloque (incluye JSDoc / ** ... * /)
 *
 * Mantiene strings y JSX literal intactos: solo neutraliza comentarios.
 */
function stripComments(src) {
  let out = "";
  let i = 0;
  const len = src.length;
  let inSingle = false;        // string '...'
  let inDouble = false;        // string "..."
  let inTemplate = false;      // template `...`
  let inLineComment = false;   // //
  let inBlockComment = false;  // /* */

  while (i < len) {
    const ch = src[i];
    const next = src[i + 1];

    if (inLineComment) {
      if (ch === "\n") {
        inLineComment = false;
        out += ch; // preserve newline
      } else {
        out += " ";
      }
      i++;
      continue;
    }

    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        out += "  ";
        i += 2;
      } else {
        out += ch === "\n" ? "\n" : " ";
        i++;
      }
      continue;
    }

    if (inSingle || inDouble || inTemplate) {
      // Escape sequence: copy verbatim
      if (ch === "\\" && i + 1 < len) {
        out += ch + src[i + 1];
        i += 2;
        continue;
      }
      if (inSingle && ch === "'") inSingle = false;
      else if (inDouble && ch === '"') inDouble = false;
      else if (inTemplate && ch === "`") inTemplate = false;
      out += ch;
      i++;
      continue;
    }

    // Detect comment starts
    if (ch === "/" && next === "/") {
      inLineComment = true;
      out += "  ";
      i += 2;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      out += "  ";
      i += 2;
      continue;
    }

    // Detect string starts
    if (ch === "'") inSingle = true;
    else if (ch === '"') inDouble = true;
    else if (ch === "`") inTemplate = true;

    out += ch;
    i++;
  }

  return out;
}

function getScope(path) {
  const ext = extname(path);
  if (ext === ".css") return "css";
  if (ext === ".tsx" || ext === ".ts" || ext === ".jsx" || ext === ".js") return "tsx";
  return null;
}

function hasLegacyAllow(content) {
  const firstLine = content.split("\n", 1)[0] || "";
  return firstLine.includes("@ds-allow-legacy");
}

// ───────────────────────────────────────────────────────────────────
// Scan
// ───────────────────────────────────────────────────────────────────

const errors = [];
const warnings = [];
const skipped = [];

for (const file of files) {
  if (isExcludedAlways(file)) continue;

  const scope = getScope(file);
  if (!scope) continue;

  if (!existsSync(file)) continue;

  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  if (hasLegacyAllow(content)) {
    skipped.push(file);
    continue;
  }

  const lines = content.split("\n");
  const scanContent = stripComments(content);
  const fileIsMigrated = isMigrated(file);

  for (const rule of RULES) {
    if (rule.scope !== "any" && rule.scope !== scope) continue;
    if (rule.pathExclude && rule.pathExclude.test(file)) continue;

    const re = new RegExp(rule.test.source, rule.test.flags);
    let match;
    while ((match = re.exec(scanContent)) !== null) {
      // Permitir match si la regla define un contexto válido
      if (rule.allowIfContext && rule.allowIfContext(match, content, match.index, file)) {
        continue;
      }

      // Localizar línea
      const upToMatch = content.slice(0, match.index);
      const lineNumber = upToMatch.split("\n").length;
      const lineText = lines[lineNumber - 1] || "";

      const violation = {
        file,
        line: lineNumber,
        ruleId: rule.id,
        message: rule.message,
        fix: rule.fix,
        snippet: lineText.trim().slice(0, 140),
      };

      // Si es módulo migrado → error real, si no → warning (mientras dura la migración)
      const effectiveSeverity =
        FORCE_WARN ? "warn" :
        rule.severity === "warn" ? "warn" :
        fileIsMigrated ? "error" : "warn";

      if (effectiveSeverity === "error") errors.push(violation);
      else warnings.push(violation);
    }
  }
}

// ───────────────────────────────────────────────────────────────────
// Reporte
// ───────────────────────────────────────────────────────────────────

function fmtViolation(v, color) {
  return [
    `${color}${BOLD}  ${v.file}:${v.line}${RESET}  ${DIM}[${v.ruleId}]${RESET}`,
    `    ${v.message}`,
    `    ${CYAN}→ ${v.fix}${RESET}`,
    `    ${DIM}${v.snippet}${RESET}`,
  ].join("\n");
}

const totalChecked = files.filter(
  (f) => !isExcludedAlways(f) && getScope(f),
).length;

console.log("");
console.log(`${BOLD}OPAI DS Guard${RESET} — checked ${totalChecked} file(s)${MODE_ALL ? " (full repo)" : " (staged)"}`);
console.log("");

if (skipped.length > 0) {
  console.log(`${DIM}Skipped (// @ds-allow-legacy): ${skipped.length}${RESET}`);
  for (const f of skipped) console.log(`${DIM}  - ${f}${RESET}`);
  console.log("");
}

if (warnings.length > 0) {
  console.log(`${YELLOW}${BOLD}⚠ ${warnings.length} warning(s) — module not yet migrated, fix-when-you-can:${RESET}`);
  for (const v of warnings) console.log(fmtViolation(v, YELLOW));
  console.log("");
}

if (errors.length > 0) {
  console.log(`${RED}${BOLD}✗ ${errors.length} error(s) in MIGRATED modules — must fix before commit:${RESET}`);
  for (const v of errors) console.log(fmtViolation(v, RED));
  console.log("");
  console.log(`${DIM}Tip: si tienes una razón legítima para una excepción puntual, agrega como primera línea del archivo:${RESET}`);
  console.log(`${DIM}  // @ds-allow-legacy <razón corta>${RESET}`);
  console.log("");
  process.exit(1);
}

if (errors.length === 0 && warnings.length === 0) {
  console.log(`${GREEN}✓ Design System OK${RESET}`);
}

process.exit(0);
