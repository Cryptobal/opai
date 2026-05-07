/**
 * Permissions v2 — Sistema de permisos granulares por módulo/submódulo
 *
 * 4 niveles: none | view | edit | full
 * Cascada: submódulo hereda del módulo padre si no tiene override explícito
 * Compatible con roles legacy (backward-compatible)
 *
 * Uso:
 *   const perms = getDefaultPermissions("editor");
 *   canView(perms, "ops", "puestos")   // → true
 *   canEdit(perms, "ops", "puestos")   // → true
 *   canDelete(perms, "ops", "puestos") // → false (solo "full")
 */

// ═══════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════

export const PERMISSION_LEVELS = ["none", "view", "edit", "full"] as const;
export type PermissionLevel = (typeof PERMISSION_LEVELS)[number];

export const LEVEL_RANK: Record<PermissionLevel, number> = {
  none: 0,
  view: 1,
  edit: 2,
  full: 3,
};

export const LEVEL_LABELS: Record<PermissionLevel, string> = {
  none: "Sin acceso",
  view: "Visualizar",
  edit: "Editar",
  full: "Completo",
};

// ── Module keys ──

export const MODULE_KEYS = [
  "hub",
  "ops",
  "crm",
  "docs",
  "payroll",
  "cpq",
  "config",
  "finance",
  "reportes_dt",
  "fiscalizacion",
] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

// ── Submodule keys per module ──

export const SUBMODULE_KEYS = {
  hub: [] as readonly string[],
  ops: [
    "puestos",
    "pauta_mensual",
    "pauta_diaria",
    "turnos_extra",
    "marcaciones",
    "ppc",
    "guardias",
    "rondas",
    "control_nocturno",
    "tickets",
    "supervision",
    "inventario",
    "eventos_laborales",
    "gamificacion",
    "installations",
    "alertas_cobertura",
    "ats",
    "ats_config",
  ] as const,
  crm: [
    "leads",
    "accounts",
    "installations",
    "dotacion",
    "contacts",
    "deals",
    "quotes",
  ] as const,
  docs: ["gestion", "operativos", "plantillas"] as const,
  payroll: ["simulador", "parametros"] as const,
  cpq: [] as readonly string[],
  config: [
    // Sección General (antes agrupados bajo "usuarios")
    "empresa",
    "usuarios",
    "roles",
    "auditoria",
    "documentos_operacionales",
    "mi_plan",
    "cumplimiento",
    // Resto de General
    "grupos",
    "integraciones",
    "notificaciones",
    "asistente_ia",
    "inteligencia_artificial",
    // Correos y Documentos
    "firmas",
    "categorias",
    // Módulos
    "crm",
    "cpq",
    "payroll",
    "ops",
    "tipos_ticket",
    "finanzas",
    "gamificacion",
    "alertas_cobertura",
    "ats",
    "psicolaboral",
    "conocimiento",
  ] as const,
  finance: [
    "rendiciones",
    "aprobaciones",
    "pagos",
    "reportes",
    "configuracion",
    "contabilidad",
    "facturacion",
    "proveedores",
  ] as const,
  reportes_dt: [] as readonly string[],
  fiscalizacion: [
    "marcaciones",
    "asistencia",
    "guardias",
    "instalaciones",
    "payroll",
    "auditlog",
    "incidentes",
  ] as const,
} as const satisfies Record<ModuleKey, readonly string[]>;

// ── Capability keys (acciones especiales no-CRUD) ──

export const CAPABILITY_KEYS = [
  "invite_users",
  "manage_users",
  "te_approve",
  "te_pay",
  "manage_settings",
  "rondas_configure",
  "rondas_resolve_alerts",
  "monitoreo_cerrar_turno",
  "control_nocturno_approve",
  "control_nocturno_delete",
  "rendicion_submit",
  "rendicion_approve",
  "rendicion_pay",
  "rendicion_configure",
  "rendicion_view_all",
  "rendicion_export",
  "finance_reports_view",
  "finance_reports_export",
  "finance_reports_drilldown",
  "contabilidad_manage",
  // Facturación granular (preferida). Usar hasFacturacionCapability para
  // chequearlas — ese helper expande automáticamente la legacy `facturacion_manage`.
  "facturacion_view",
  "facturacion_create_draft",
  "facturacion_issue",
  "facturacion_credit_note",
  "facturacion_void",
  "facturacion_resend_email",
  "facturacion_configure",
  "facturacion_manage", // DEPRECATED: legacy capability — se expande a las 7 granulares vía hasFacturacionCapability.
  "ticket_approve",
  "ticket_manage_types",
  "supervision_checkin",
  "supervision_view_own",
  "supervision_view_all",
  "supervision_dashboard",
  "gamificacion_bonos_aprobar",
  "dt_manage_sessions",
  "dt_view_incidents",
  "alerta_cobertura_crear",
  "alerta_cobertura_gestionar",
  "alerta_cobertura_config",
  "ats_publicar",
  "ats_config",
] as const;
export type CapabilityKey = (typeof CAPABILITY_KEYS)[number];

// ── Main permissions shape (stored as JSON in DB) ──

export interface RolePermissions {
  modules: Partial<Record<ModuleKey, PermissionLevel>>;
  submodules: Record<string, PermissionLevel>;
  capabilities: Partial<Record<CapabilityKey, boolean>>;
}

export function mergeRolePermissions(
  base: RolePermissions,
  override: RolePermissions,
): RolePermissions {
  return {
    modules: { ...base.modules, ...override.modules },
    submodules: { ...base.submodules, ...override.submodules },
    capabilities: { ...base.capabilities, ...override.capabilities },
  };
}

// ═══════════════════════════════════════════════════════════════
//  METADATA (for UI — labels, hrefs)
// ═══════════════════════════════════════════════════════════════

export interface ModuleMeta {
  key: ModuleKey;
  label: string;
}

export interface SubmoduleMeta {
  key: string; // "ops.puestos"
  module: ModuleKey;
  submodule: string;
  label: string;
  href: string;
}

export interface CapabilityMeta {
  key: CapabilityKey;
  label: string;
  description: string;
  /** Módulo al que pertenece la capacidad (para agrupar en UI Roles y Permisos) */
  moduleKey?: ModuleKey;
  /** Submódulo opcional (ej. ops.supervision para supervision_*) */
  submoduleKey?: string;
}

export const MODULE_META: ModuleMeta[] = [
  { key: "hub", label: "Hub" },
  { key: "ops", label: "Operaciones" },
  { key: "crm", label: "CRM" },
  { key: "docs", label: "Documentos" },
  { key: "payroll", label: "Payroll" },
  { key: "cpq", label: "CPQ" },
  { key: "config", label: "Configuración" },
  { key: "finance", label: "Finanzas" },
  { key: "reportes_dt", label: "Reportes DT" },
  { key: "fiscalizacion", label: "Fiscalización DT" },
];

export const SUBMODULE_META: SubmoduleMeta[] = [
  // ── Ops ──
  { key: "ops.puestos", module: "ops", submodule: "puestos", label: "Puestos", href: "/ops/puestos" },
  { key: "ops.pauta_mensual", module: "ops", submodule: "pauta_mensual", label: "Pauta mensual", href: "/ops/pauta-mensual" },
  { key: "ops.pauta_diaria", module: "ops", submodule: "pauta_diaria", label: "Asistencia diaria", href: "/ops/pauta-diaria" },
  { key: "ops.turnos_extra", module: "ops", submodule: "turnos_extra", label: "Turnos extra", href: "/ops/turnos-extra" },
  { key: "ops.marcaciones", module: "ops", submodule: "marcaciones", label: "Marcaciones", href: "/ops/marcaciones" },
  { key: "ops.ppc", module: "ops", submodule: "ppc", label: "PPC", href: "/ops/ppc" },
  { key: "ops.guardias", module: "ops", submodule: "guardias", label: "Guardias", href: "/personas/guardias" },
  { key: "ops.rondas", module: "ops", submodule: "rondas", label: "Rondas", href: "/ops/rondas" },
  { key: "ops.control_nocturno", module: "ops", submodule: "control_nocturno", label: "Control nocturno", href: "/ops/control-nocturno" },
  { key: "ops.tickets", module: "ops", submodule: "tickets", label: "Tickets", href: "/ops/tickets" },
  { key: "ops.supervision", module: "ops", submodule: "supervision", label: "Supervisión", href: "/ops/supervision" },
  { key: "ops.inventario", module: "ops", submodule: "inventario", label: "Inventario", href: "/ops/inventario" },
  { key: "ops.eventos_laborales", module: "ops", submodule: "eventos_laborales", label: "Eventos laborales", href: "/personas/guardias" },
  { key: "ops.gamificacion", module: "ops", submodule: "gamificacion", label: "Gamificación", href: "/ops/gamificacion" },
  { key: "ops.installations", module: "ops", submodule: "installations", label: "Instalaciones", href: "/crm/installations" },
  { key: "ops.alertas_cobertura", module: "ops", submodule: "alertas_cobertura", label: "Alertas de cobertura", href: "/ops/alertas-cobertura" },
  { key: "ops.ats", module: "ops", submodule: "ats", label: "ATS — Reclutamiento", href: "/ops/ats" },
  // ── CRM ──
  { key: "crm.leads", module: "crm", submodule: "leads", label: "Leads", href: "/crm/leads" },
  { key: "crm.accounts", module: "crm", submodule: "accounts", label: "Cuentas", href: "/crm/accounts" },
  { key: "crm.installations", module: "crm", submodule: "installations", label: "Instalaciones", href: "/crm/installations" },
  { key: "crm.dotacion", module: "crm", submodule: "dotacion", label: "Dotación", href: "" },
  { key: "crm.contacts", module: "crm", submodule: "contacts", label: "Contactos", href: "/crm/contacts" },
  { key: "crm.deals", module: "crm", submodule: "deals", label: "Negocios", href: "/crm/deals" },
  { key: "crm.quotes", module: "crm", submodule: "quotes", label: "Cotizaciones", href: "/crm/cotizaciones" },
  { key: "crm.prospecting", module: "crm", submodule: "prospecting", label: "Prospección", href: "/crm/prospecting" },
  // ── Docs ──
  { key: "docs.gestion", module: "docs", submodule: "gestion", label: "Gestión documental", href: "/opai/documentos" },
  { key: "docs.operativos", module: "docs", submodule: "operativos", label: "Documentos operativos", href: "/opai/documentos-operativos" },
  { key: "docs.plantillas", module: "docs", submodule: "plantillas", label: "Plantillas (Templates)", href: "/opai/documentos/templates" },
  // ── Payroll ──
  { key: "payroll.simulador", module: "payroll", submodule: "simulador", label: "Simulador", href: "/payroll/simulator" },
  { key: "payroll.parametros", module: "payroll", submodule: "parametros", label: "Parámetros", href: "/payroll/parameters" },
  // ── Finance ──
  { key: "finance.rendiciones", module: "finance", submodule: "rendiciones", label: "Rendiciones", href: "/finanzas/rendiciones" },
  { key: "finance.aprobaciones", module: "finance", submodule: "aprobaciones", label: "Aprobaciones", href: "/finanzas/aprobaciones" },
  { key: "finance.pagos", module: "finance", submodule: "pagos", label: "Pagos", href: "/finanzas/pagos" },
  { key: "finance.reportes", module: "finance", submodule: "reportes", label: "Reportes", href: "/finanzas/reportes" },
  { key: "finance.configuracion", module: "finance", submodule: "configuracion", label: "Configuración", href: "/opai/configuracion/finanzas" },
  { key: "finance.configuracion_dte", module: "finance", submodule: "configuracion", label: "Configuración DTE", href: "/opai/configuracion/finanzas/dte" },
  { key: "finance.contabilidad", module: "finance", submodule: "contabilidad", label: "Contabilidad", href: "/finanzas/contabilidad" },
  { key: "finance.facturacion", module: "finance", submodule: "facturacion", label: "Facturación", href: "/finanzas/facturacion" },
  { key: "finance.proveedores", module: "finance", submodule: "proveedores", label: "Proveedores", href: "/finanzas/proveedores" },
  // ── Config ──
  { key: "config.usuarios", module: "config", submodule: "usuarios", label: "Usuarios", href: "/opai/configuracion/usuarios" },
  { key: "config.empresa", module: "config", submodule: "empresa", label: "Empresa", href: "/opai/configuracion/empresa" },
  { key: "config.roles", module: "config", submodule: "roles", label: "Roles y Permisos", href: "/opai/configuracion/roles" },
  { key: "config.auditoria", module: "config", submodule: "auditoria", label: "Auditoría", href: "/opai/configuracion/auditoria" },
  { key: "config.documentos_operacionales", module: "config", submodule: "documentos_operacionales", label: "Documentos Operacionales", href: "/opai/configuracion/documentos-operacionales" },
  { key: "config.mi_plan", module: "config", submodule: "mi_plan", label: "Mi Plan", href: "/opai/configuracion/mi-plan" },
  { key: "config.cumplimiento", module: "config", submodule: "cumplimiento", label: "Cumplimiento", href: "/opai/configuracion/cumplimiento" },
  { key: "config.asistente_ia", module: "config", submodule: "asistente_ia", label: "Asistente IA", href: "/opai/configuracion/asistente-ia" },
  { key: "config.informes_vulnerabilidad", module: "config", submodule: "informes_vulnerabilidad", label: "Informes de Vulnerabilidad", href: "/opai/configuracion/informes-vulnerabilidad" },
  { key: "config.gamificacion", module: "config", submodule: "gamificacion", label: "Gamificación", href: "/opai/configuracion/gamificacion" },
  { key: "config.grupos", module: "config", submodule: "grupos", label: "Grupos", href: "/opai/configuracion/grupos" },
  { key: "config.integraciones", module: "config", submodule: "integraciones", label: "Integraciones", href: "/opai/configuracion/integraciones" },
  { key: "config.firmas", module: "config", submodule: "firmas", label: "Firmas", href: "/opai/configuracion/firmas" },
  { key: "config.categorias", module: "config", submodule: "categorias", label: "Categorías plantillas", href: "/opai/configuracion/categorias-plantillas" },
  { key: "config.crm", module: "config", submodule: "crm", label: "CRM", href: "/opai/configuracion/crm" },
  { key: "config.cpq", module: "config", submodule: "cpq", label: "CPQ", href: "/opai/configuracion/cpq" },
  { key: "config.payroll", module: "config", submodule: "payroll", label: "Payroll", href: "/opai/configuracion/payroll" },
  { key: "config.notificaciones", module: "config", submodule: "notificaciones", label: "Notificaciones", href: "/opai/configuracion/notificaciones" },
  { key: "config.ops", module: "config", submodule: "ops", label: "Operaciones", href: "/opai/configuracion/ops" },
  { key: "config.tipos_ticket", module: "config", submodule: "tipos_ticket", label: "Tipos de ticket", href: "/opai/configuracion/tipos-ticket" },
  { key: "config.finanzas", module: "config", submodule: "finanzas", label: "Finanzas", href: "/opai/configuracion/finanzas" },
  { key: "config.inteligencia_artificial", module: "config", submodule: "inteligencia_artificial", label: "Inteligencia Artificial", href: "/opai/configuracion/inteligencia-artificial" },
  { key: "config.alertas_cobertura", module: "config", submodule: "alertas_cobertura", label: "Alertas Cobertura", href: "/opai/configuracion/alertas-cobertura" },
  { key: "config.psicolaboral", module: "config", submodule: "psicolaboral", label: "Psicolaboral", href: "/opai/configuracion/psicolaboral" },
  { key: "config.conocimiento", module: "config", submodule: "conocimiento", label: "Conocimiento", href: "/opai/configuracion/conocimiento" },
  // ── Fiscalización DT ──
  { key: "fiscalizacion.marcaciones", module: "fiscalizacion", submodule: "marcaciones", label: "Marcaciones", href: "/fiscalizacion" },
  { key: "fiscalizacion.asistencia", module: "fiscalizacion", submodule: "asistencia", label: "Asistencia", href: "/fiscalizacion" },
  { key: "fiscalizacion.guardias", module: "fiscalizacion", submodule: "guardias", label: "Guardias", href: "/fiscalizacion" },
  { key: "fiscalizacion.instalaciones", module: "fiscalizacion", submodule: "instalaciones", label: "Instalaciones", href: "/fiscalizacion" },
  { key: "fiscalizacion.payroll", module: "fiscalizacion", submodule: "payroll", label: "Liquidaciones", href: "/fiscalizacion" },
  { key: "fiscalizacion.auditlog", module: "fiscalizacion", submodule: "auditlog", label: "Auditoría", href: "/fiscalizacion" },
  { key: "fiscalizacion.incidentes", module: "fiscalizacion", submodule: "incidentes", label: "Incidentes", href: "/fiscalizacion" },
];

export const CAPABILITY_META: CapabilityMeta[] = [
  { key: "invite_users", label: "Invitar usuarios", description: "Puede enviar invitaciones a nuevos usuarios", moduleKey: "config" },
  { key: "manage_users", label: "Gestionar usuarios", description: "Puede editar roles y desactivar usuarios", moduleKey: "config" },
  { key: "te_approve", label: "Aprobar turnos extra", description: "Puede aprobar o rechazar turnos extra", moduleKey: "ops" },
  { key: "te_pay", label: "Generar pagos TE", description: "Puede crear lotes de pago de turnos extra", moduleKey: "ops" },
  { key: "manage_settings", label: "Configuración global", description: "Puede modificar configuración general del sistema", moduleKey: "config" },
  { key: "rondas_configure", label: "Configurar rondas", description: "Puede crear/editar checkpoints, plantillas y programación de rondas", moduleKey: "ops", submoduleKey: "rondas" },
  { key: "rondas_resolve_alerts", label: "Resolver alertas rondas", description: "Puede marcar como resueltas las alertas de rondas", moduleKey: "ops", submoduleKey: "rondas" },
  { key: "monitoreo_cerrar_turno", label: "Cerrar turno de otro operador", description: "Puede cerrar turnos de monitoreo iniciados por otros usuarios", moduleKey: "ops", submoduleKey: "rondas" },
  { key: "control_nocturno_approve", label: "Aprobar control nocturno", description: "Puede aprobar o rechazar reportes de control nocturno", moduleKey: "ops", submoduleKey: "control_nocturno" },
  { key: "control_nocturno_delete", label: "Eliminar control nocturno", description: "Puede eliminar reportes de control nocturno (solo admin/propietario)", moduleKey: "ops", submoduleKey: "control_nocturno" },
  { key: "rendicion_submit", label: "Crear rendiciones", description: "Puede crear y enviar rendiciones de gastos", moduleKey: "finance" },
  { key: "rendicion_approve", label: "Aprobar rendiciones", description: "Puede aprobar o rechazar rendiciones de gastos", moduleKey: "finance" },
  { key: "rendicion_pay", label: "Pagar rendiciones", description: "Puede generar pagos masivos o manuales de rendiciones", moduleKey: "finance" },
  { key: "rendicion_configure", label: "Configurar rendiciones", description: "Puede configurar ítems, parámetros y reglas de rendiciones", moduleKey: "finance" },
  { key: "rendicion_view_all", label: "Ver todas las rendiciones", description: "Puede ver rendiciones de todos los usuarios, no solo las propias", moduleKey: "finance" },
  { key: "rendicion_export", label: "Exportar rendiciones", description: "Puede exportar rendiciones a CSV/Excel", moduleKey: "finance" },
  { key: "finance_reports_view", label: "Ver reportes financieros", description: "Acceso al módulo de reportes financieros (Dashboard, EE.RR., Balance, etc.)", moduleKey: "finance" },
  { key: "finance_reports_export", label: "Exportar reportes financieros", description: "Puede descargar reportes financieros en PDF/Excel", moduleKey: "finance" },
  { key: "finance_reports_drilldown", label: "Drill-down en reportes", description: "Puede abrir el libro mayor por cuenta y ver detalle de DTEs por cliente desde reportes", moduleKey: "finance" },
  { key: "contabilidad_manage", label: "Gestionar contabilidad", description: "Puede crear asientos, gestionar plan de cuentas y periodos contables", moduleKey: "finance" },
  { key: "facturacion_view", label: "Ver facturación", description: "Ver DTEs emitidos, recibidos, folios y libro IVA. Solo lectura.", moduleKey: "finance" },
  { key: "facturacion_create_draft", label: "Crear borradores DTE", description: "Puede preparar DTEs como borrador y registrar DTEs recibidos, sin emitir al SII.", moduleKey: "finance" },
  { key: "facturacion_issue", label: "Emitir facturas", description: "Puede emitir facturas afectas y exentas (33, 34) al SII. Genera obligaciones fiscales.", moduleKey: "finance" },
  { key: "facturacion_credit_note", label: "Emitir notas crédito/débito", description: "Puede emitir Notas de Crédito (61) y Notas de Débito (56) al SII.", moduleKey: "finance" },
  { key: "facturacion_void", label: "Anular DTEs", description: "Puede anular DTEs emitidos. Acción no reversible.", moduleKey: "finance" },
  { key: "facturacion_resend_email", label: "Reenviar emails de DTE", description: "Puede reenviar el email del DTE al receptor (no emite documentos nuevos).", moduleKey: "finance" },
  { key: "facturacion_configure", label: "Configurar emisor DTE", description: "Configura datos del emisor, certificado digital y archivos CAF.", moduleKey: "finance" },
  { key: "facturacion_manage", label: "Gestionar facturación (legacy)", description: "DEPRECATED: capability legacy que otorga todos los permisos de facturación. Use las capabilities granulares.", moduleKey: "finance" },
  { key: "ticket_approve", label: "Aprobar tickets", description: "Puede aprobar o rechazar tickets que le correspondan según su grupo", moduleKey: "ops", submoduleKey: "tickets" },
  { key: "ticket_manage_types", label: "Configurar tipos de ticket", description: "Puede crear/editar tipos de solicitud y cadenas de aprobación", moduleKey: "ops", submoduleKey: "tickets" },
  { key: "supervision_checkin", label: "Check-in de supervisión", description: "Puede iniciar y finalizar visitas con georreferencia", moduleKey: "ops", submoduleKey: "supervision" },
  { key: "supervision_view_own", label: "Ver visitas propias", description: "Puede ver solo las visitas de supervisión creadas por sí mismo", moduleKey: "ops", submoduleKey: "supervision" },
  { key: "supervision_view_all", label: "Ver todas las visitas", description: "Puede ver visitas de supervisión de cualquier supervisor", moduleKey: "ops", submoduleKey: "supervision" },
  { key: "supervision_dashboard", label: "Dashboard supervisión", description: "Puede ver KPIs y reportes consolidados de supervisión", moduleKey: "ops", submoduleKey: "supervision" },
  { key: "gamificacion_bonos_aprobar", label: "Aprobar bonos gamificación", description: "Puede aprobar o rechazar sugerencias de bono generadas por gamificación", moduleKey: "ops", submoduleKey: "gamificacion" },
  { key: "dt_manage_sessions", label: "Gestionar accesos DT", description: "Puede crear y revocar accesos temporales para inspectores de la DT", moduleKey: "fiscalizacion" },
  { key: "dt_view_incidents", label: "Ver incidentes de servicio", description: "Puede ver y registrar incidentes de servicio del sistema", moduleKey: "fiscalizacion" },
  { key: "alerta_cobertura_crear", label: "Crear alertas de cobertura", description: "Puede crear alertas de cobertura nacional cuando falta un guardia", moduleKey: "ops", submoduleKey: "alertas_cobertura" },
  { key: "alerta_cobertura_gestionar", label: "Gestionar alertas de cobertura", description: "Puede cancelar, re-alertar y confirmar alertas de cobertura", moduleKey: "ops", submoduleKey: "alertas_cobertura" },
  { key: "alerta_cobertura_config", label: "Configurar alertas de cobertura", description: "Puede modificar oleadas, tiempos y parámetros del módulo de alertas", moduleKey: "ops", submoduleKey: "alertas_cobertura" },
  { key: "ats_publicar", label: "Publicar avisos ATS", description: "Puede crear y publicar avisos de empleo en portales externos", moduleKey: "ops", submoduleKey: "ats" },
  { key: "ats_config", label: "Configurar ATS", description: "Puede modificar pesos de match score y config del módulo ATS", moduleKey: "ops", submoduleKey: "ats_config" },
];

// ═══════════════════════════════════════════════════════════════
//  EMPTY & FULL PERMISSION HELPERS
// ═══════════════════════════════════════════════════════════════

export const EMPTY_PERMISSIONS: RolePermissions = {
  modules: {},
  submodules: {},
  capabilities: {},
};

const ROLE_ALIASES: Record<string, string> = {
  propietario: "owner",
  dueno: "owner",
  "dueño": "owner",
  administrador: "admin",
  gerente: "editor",
  jefatura: "jefe_operaciones",
  "jefe operaciones": "jefe_operaciones",
  "jefe de operaciones": "jefe_operaciones",
  "central monitoreo": "central_monitoreo",
  "central de monitoreo": "central_monitoreo",
  operations: "operaciones",
  operaciones: "operaciones",
  recruit: "reclutamiento",
  recruiting: "reclutamiento",
  "solo operaciones": "solo_ops",
  "solo crm": "solo_crm",
  "solo documentos": "solo_documentos",
  "solo payroll": "solo_payroll",
  finance: "finanzas",
  lectura: "viewer",
  supervisor: "supervisor",
  "inspector dt": "inspector_dt",
  "inspector_dt": "inspector_dt",
};

export function normalizeRole(role: string): string {
  const key = role.trim().toLowerCase();
  return ROLE_ALIASES[key] ?? key;
}

function fullPermissions(): RolePermissions {
  const modules: Partial<Record<ModuleKey, PermissionLevel>> = {};
  for (const m of MODULE_KEYS) modules[m] = "full";
  const capabilities: Partial<Record<CapabilityKey, boolean>> = {};
  for (const c of CAPABILITY_KEYS) capabilities[c] = true;
  return { modules, submodules: {}, capabilities };
}

// ── Permisos del rol finanzas ──
function finanzasPermissions(): RolePermissions {
  return {
    modules: {
      hub: "view",
      ops: "none",
      crm: "none",
      docs: "none",
      payroll: "none",
      cpq: "none",
      config: "none",
      finance: "full",
    },
    submodules: {},
    capabilities: {
      rendicion_submit: true,
      rendicion_approve: true,
      rendicion_pay: true,
      rendicion_configure: true,
      rendicion_view_all: true,
      rendicion_export: true,
      finance_reports_view: true,
      finance_reports_export: true,
      finance_reports_drilldown: true,
      contabilidad_manage: true,
      facturacion_manage: true,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
//  DEFAULT PERMISSIONS PER LEGACY ROLE
//  (mapeo exacto de los 11 roles actuales)
// ═══════════════════════════════════════════════════════════════

export const DEFAULT_ROLE_PERMISSIONS: Record<string, RolePermissions> = {
  // ═══════════════════════════════════════════════════════════
  //  7 ROLES ACTIVOS
  // ═══════════════════════════════════════════════════════════

  owner: fullPermissions(),

  admin: (() => {
    const caps: Partial<Record<CapabilityKey, boolean>> = {};
    for (const c of CAPABILITY_KEYS) caps[c] = true;
    caps.manage_settings = false;
    return {
      modules: { hub: "full", ops: "full", crm: "full", docs: "full", cpq: "full", payroll: "full", finance: "full", config: "edit" },
      submodules: {},
      capabilities: caps,
    } as RolePermissions;
  })(),

  editor: {
    modules: { hub: "full", ops: "edit", crm: "edit", docs: "edit", cpq: "edit", payroll: "view", finance: "view", config: "view" },
    submodules: {
      // Admin-only: bloqueados explícitamente
      "config.empresa": "none",
      "config.roles": "none",
      "config.auditoria": "none",
      "config.cumplimiento": "none",
      "config.documentos_operacionales": "none",
      "config.mi_plan": "none",
      "config.gamificacion": "none",
      "config.asistente_ia": "none",
      "config.informes_vulnerabilidad": "none",
      "config.inteligencia_artificial": "none",
      // Edita
      "config.firmas": "edit",
      "config.integraciones": "edit",
      "config.notificaciones": "edit",
      "config.categorias": "edit",
      "config.crm": "edit",
      "config.cpq": "edit",
      "config.ops": "edit",
      "config.tipos_ticket": "edit",
      "config.alertas_cobertura": "edit",
      "config.ats": "edit",
      // Inventario: editor puede gestionar todo (incluye eliminar bodegas/productos)
      "ops.inventario": "full",
      // Solo lectura
      "config.usuarios": "view",
      "config.grupos": "view",
      "config.payroll": "view",
      "config.finanzas": "view",
    },
    capabilities: {
      te_approve: true,
      rondas_configure: true,
      rondas_resolve_alerts: true,
      control_nocturno_approve: true,
      ticket_approve: true,
      gamificacion_bonos_aprobar: true,
      supervision_view_own: true,
      supervision_view_all: true,
      supervision_dashboard: true,
      rendicion_submit: true,
      rendicion_approve: true,
      rendicion_view_all: true,
      alerta_cobertura_crear: true,
      alerta_cobertura_gestionar: true,
    },
  },

  jefe_operaciones: {
    modules: { hub: "view", ops: "edit", crm: "view", docs: "none", cpq: "none", payroll: "none", finance: "view", config: "none" },
    submodules: {
      "crm.installations": "view",
      "crm.accounts": "view",
      "crm.contacts": "view",
      "crm.leads": "none",
      "crm.deals": "none",
      "crm.quotes": "none",
      "finance.rendiciones": "edit",
      "finance.pagos": "none",
      "finance.configuracion": "none",
    },
    capabilities: {
      te_approve: true,
      rondas_configure: true,
      rondas_resolve_alerts: true,
      monitoreo_cerrar_turno: true,
      control_nocturno_approve: true,
      ticket_approve: true,
      supervision_checkin: true,
      supervision_view_own: true,
      supervision_view_all: true,
      supervision_dashboard: true,
      rendicion_submit: true,
      rendicion_approve: true,
      rendicion_view_all: true,
      alerta_cobertura_crear: true,
      alerta_cobertura_gestionar: true,
    },
  },

  central_monitoreo: {
    modules: { hub: "view", ops: "view", crm: "none", docs: "none", cpq: "none", payroll: "none", finance: "none", config: "none" },
    submodules: {
      "ops.rondas": "edit",
      "ops.supervision": "view",
      "ops.control_nocturno": "view",
      "ops.alertas_cobertura": "edit",
      "crm.installations": "view",
    },
    capabilities: {
      rondas_resolve_alerts: true,
      monitoreo_cerrar_turno: true,
      control_nocturno_approve: true,
      ticket_approve: true,
      supervision_view_all: true,
      supervision_dashboard: true,
      alerta_cobertura_crear: true,
      alerta_cobertura_gestionar: true,
    },
  },

  supervisor: {
    modules: { hub: "view", ops: "edit", crm: "view", docs: "none", cpq: "none", payroll: "none", finance: "none", config: "none" },
    submodules: {
      "crm.installations": "view",
      "crm.accounts": "view",
      "crm.contacts": "view",
      "crm.leads": "none",
      "crm.deals": "none",
      "crm.quotes": "none",
      "ops.supervision": "full",
      "ops.rondas": "edit",
      "ops.alertas_cobertura": "edit",
      "ops.inventario": "edit",
      "finance.rendiciones": "edit",
    },
    capabilities: {
      ticket_approve: true,
      supervision_checkin: true,
      supervision_view_own: true,
      supervision_dashboard: true,
      rendicion_submit: true,
      rondas_configure: true,
      rondas_resolve_alerts: true,
      alerta_cobertura_crear: true,
      alerta_cobertura_gestionar: true,
    },
  },

  viewer: {
    modules: { hub: "view", ops: "view", crm: "view", docs: "view", cpq: "none", payroll: "none", finance: "none", config: "none" },
    submodules: {},
    capabilities: {},
  },

  // ═══════════════════════════════════════════════════════════
  //  LEGACY — sin usuarios activos, mantener por retrocompatibilidad
  // ═══════════════════════════════════════════════════════════

  // LEGACY
  rrhh: {
    modules: { hub: "view", ops: "edit", crm: "none", docs: "none", payroll: "none", cpq: "none", config: "none", finance: "view" },
    submodules: { "crm.installations": "view", "crm.dotacion": "view", "ops.installations": "view", "ops.gamificacion": "edit" },
    capabilities: { rendicion_view_all: true, ticket_approve: true, gamificacion_bonos_aprobar: true },
  },

  // LEGACY
  operaciones: {
    modules: { hub: "view", ops: "edit", crm: "none", docs: "none", payroll: "none", cpq: "none", config: "none", finance: "edit" },
    submodules: { "finance.pagos": "none", "finance.configuracion": "none", "crm.installations": "view", "crm.dotacion": "edit", "ops.installations": "view" },
    capabilities: { te_approve: true, rondas_configure: true, rondas_resolve_alerts: true, monitoreo_cerrar_turno: true, control_nocturno_approve: true, rendicion_submit: true, rendicion_approve: true, ticket_approve: true, gamificacion_bonos_aprobar: true },
  },

  // LEGACY
  finanzas: finanzasPermissions(),

  // LEGACY
  reclutamiento: {
    modules: { hub: "view", ops: "edit", crm: "none", docs: "none", payroll: "none", cpq: "none", config: "none", finance: "none" },
    submodules: { "ops.rondas": "none", "crm.installations": "view", "crm.dotacion": "edit", "ops.installations": "view", "ops.ats": "full", "ops.ats_config": "edit" },
    capabilities: { ats_publicar: true, ats_config: true },
  },

  // LEGACY
  solo_ops: {
    modules: { hub: "view", ops: "edit", crm: "none", docs: "none", payroll: "none", cpq: "none", config: "none", finance: "none" },
    submodules: { "crm.installations": "view", "crm.dotacion": "edit", "ops.installations": "view" },
    capabilities: {},
  },

  // LEGACY
  solo_crm: {
    modules: { hub: "view", ops: "none", crm: "edit", docs: "none", payroll: "none", cpq: "none", config: "none", finance: "none" },
    submodules: {},
    capabilities: {},
  },

  // LEGACY
  solo_documentos: {
    modules: { hub: "view", ops: "none", crm: "none", docs: "view", payroll: "none", cpq: "none", config: "none", finance: "none" },
    submodules: {},
    capabilities: {},
  },

  // LEGACY
  solo_payroll: {
    modules: { hub: "view", ops: "none", crm: "none", docs: "none", payroll: "edit", cpq: "none", config: "none", finance: "none" },
    submodules: {},
    capabilities: {},
  },

  // LEGACY
  inspector_dt: {
    modules: { hub: "none", ops: "none", crm: "none", docs: "none", payroll: "none", cpq: "none", config: "none", finance: "none", reportes_dt: "view", fiscalizacion: "view" },
    submodules: {
      "fiscalizacion.marcaciones": "view", "fiscalizacion.asistencia": "view", "fiscalizacion.guardias": "view",
      "fiscalizacion.instalaciones": "view", "fiscalizacion.payroll": "view", "fiscalizacion.auditlog": "view", "fiscalizacion.incidentes": "view",
    },
    capabilities: {},
  },
};

// ═══════════════════════════════════════════════════════════════
//  RESOLUTION FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Nivel efectivo de permiso para un módulo o submódulo.
 * Regla de cascada: si no hay override de submódulo, hereda del módulo padre.
 */
export function getEffectiveLevel(
  perms: RolePermissions,
  module: ModuleKey,
  submodule?: string,
): PermissionLevel {
  if (!submodule) {
    return perms.modules[module] ?? "none";
  }
  const subKey = `${module}.${submodule}`;
  if (subKey in perms.submodules) {
    return perms.submodules[subKey];
  }
  // Cascada: hereda del módulo padre
  return perms.modules[module] ?? "none";
}

/** ¿Puede ver? (view, edit o full) */
export function canView(
  perms: RolePermissions,
  module: ModuleKey,
  submodule?: string,
): boolean {
  return LEVEL_RANK[getEffectiveLevel(perms, module, submodule)] >= LEVEL_RANK.view;
}

/** ¿Puede ver Instalaciones? (crm.installations O ops.installations) */
export function canViewInstallations(perms: RolePermissions): boolean {
  return canView(perms, "crm", "installations") || canView(perms, "ops", "installations");
}

/** ¿Puede editar Instalaciones? (crm.installations O ops.installations) */
export function canEditInstallations(perms: RolePermissions): boolean {
  return canEdit(perms, "crm", "installations") || canEdit(perms, "ops", "installations");
}

/** ¿Puede eliminar Instalaciones? (crm.installations O ops.installations) */
export function canDeleteInstallations(perms: RolePermissions): boolean {
  return canDelete(perms, "crm", "installations") || canDelete(perms, "ops", "installations");
}

/** ¿Puede crear/editar? (edit o full) */
export function canEdit(
  perms: RolePermissions,
  module: ModuleKey,
  submodule?: string,
): boolean {
  return LEVEL_RANK[getEffectiveLevel(perms, module, submodule)] >= LEVEL_RANK.edit;
}

/** ¿Puede eliminar? (solo full) */
export function canDelete(
  perms: RolePermissions,
  module: ModuleKey,
  submodule?: string,
): boolean {
  return LEVEL_RANK[getEffectiveLevel(perms, module, submodule)] >= LEVEL_RANK.full;
}

/** ¿Tiene una capacidad especial? */
export function hasCapability(
  perms: RolePermissions,
  cap: CapabilityKey,
): boolean {
  return perms.capabilities[cap] === true;
}

/**
 * Set canónico de capabilities granulares de facturación.
 * Usado por `hasFacturacionCapability` para expandir la legacy
 * `facturacion_manage` cuando se chequean las nuevas capabilities.
 */
const FACTURACION_GRANULAR_CAPABILITIES = [
  "facturacion_view",
  "facturacion_create_draft",
  "facturacion_issue",
  "facturacion_credit_note",
  "facturacion_void",
  "facturacion_resend_email",
  "facturacion_configure",
] as const satisfies readonly CapabilityKey[];

export type FacturacionCapability =
  (typeof FACTURACION_GRANULAR_CAPABILITIES)[number];

/**
 * Chequea una capability granular de facturación.
 *
 * Mapea automáticamente la legacy `facturacion_manage` (capability monolítica)
 * al conjunto completo de capabilities granulares — esto preserva
 * retro-compatibilidad con roles ya configurados que tenían
 * `facturacion_manage: true`.
 *
 * Preferí este helper sobre `hasCapability(perms, "facturacion_*")` para los
 * checks de facturación. La capability legacy se irá removiendo en un PR
 * posterior cuando se confirme migración completa de roles custom.
 *
 * @example
 *   if (!hasFacturacionCapability(perms, "facturacion_issue")) return forbidden();
 */
export function hasFacturacionCapability(
  perms: RolePermissions,
  capability: FacturacionCapability,
): boolean {
  if (perms.capabilities?.[capability] === true) return true;
  // Legacy: cualquier rol con `facturacion_manage` recibe todas las granulares.
  if (perms.capabilities?.facturacion_manage === true) return true;
  return false;
}

/**
 * ¿Tiene acceso a al menos un submódulo de este módulo?
 * (Para decidir si mostrar el módulo en el sidebar)
 */
export function hasModuleAccess(
  perms: RolePermissions,
  module: ModuleKey,
): boolean {
  if (canView(perms, module)) return true;
  const subs = SUBMODULE_KEYS[module] as readonly string[];
  return subs.some((sub) => canView(perms, module, sub));
}

/** Submódulos visibles para un módulo dado */
export function getVisibleSubmodules(
  perms: RolePermissions,
  module: ModuleKey,
): SubmoduleMeta[] {
  return SUBMODULE_META
    .filter((m) => m.module === module)
    .filter((m) => canView(perms, module, m.submodule));
}

/** Resolver permisos desde un rol legacy (sin DB) */
export function getDefaultPermissions(role: string): RolePermissions {
  return DEFAULT_ROLE_PERMISSIONS[normalizeRole(role)] ?? EMPTY_PERMISSIONS;
}

// ═══════════════════════════════════════════════════════════════
//  DIFF & STATS HELPERS (UI)
// ═══════════════════════════════════════════════════════════════

export interface PermissionsDiff {
  modules: ModuleKey[];
  submodules: string[];
  capabilities: CapabilityKey[];
  total: number;
}

/**
 * Diferencias entre `current` y `preset` (para indicar "modificado vs preset").
 * Solo cuenta cambios reales: nivel distinto en módulo, override de submódulo
 * distinto al heredado del padre del preset, capacidad activada/desactivada.
 */
export function diffPermissions(
  current: RolePermissions,
  preset: RolePermissions,
): PermissionsDiff {
  const modules: ModuleKey[] = [];
  for (const m of MODULE_KEYS) {
    const a = current.modules[m] ?? "none";
    const b = preset.modules[m] ?? "none";
    if (a !== b) modules.push(m);
  }

  const submodules: string[] = [];
  const allSubKeys = new Set<string>([
    ...Object.keys(current.submodules ?? {}),
    ...Object.keys(preset.submodules ?? {}),
  ]);
  for (const key of allSubKeys) {
    const [mod, sub] = key.split(".");
    if (!mod || !sub) continue;
    const a = getEffectiveLevel(current, mod as ModuleKey, sub);
    const b = getEffectiveLevel(preset, mod as ModuleKey, sub);
    if (a !== b) submodules.push(key);
  }

  const capabilities: CapabilityKey[] = [];
  for (const c of CAPABILITY_KEYS) {
    const a = !!current.capabilities[c];
    const b = !!preset.capabilities[c];
    if (a !== b) capabilities.push(c);
  }

  return {
    modules,
    submodules,
    capabilities,
    total: modules.length + submodules.length + capabilities.length,
  };
}

/** Resumen numérico para tarjetas y tabs Resumen */
export interface PermissionsSummary {
  /** Cantidad de módulos con al menos `view` (excluye hub si quieres) */
  accessibleModules: number;
  /** Total de módulos posibles (de la lista MODULE_KEYS) */
  totalModules: number;
  /** Cantidad de submódulos con al menos `view` */
  accessibleSubmodules: number;
  /** Total de submódulos definidos en metadata */
  totalSubmodules: number;
  /** Capacidades activas */
  capabilities: number;
}

export function summarizePermissions(perms: RolePermissions): PermissionsSummary {
  let accessibleModules = 0;
  for (const m of MODULE_KEYS) {
    if (LEVEL_RANK[perms.modules[m] ?? "none"] >= LEVEL_RANK.view) {
      accessibleModules++;
    }
  }

  let accessibleSubmodules = 0;
  let totalSubmodules = 0;
  for (const sub of SUBMODULE_META) {
    totalSubmodules++;
    if (LEVEL_RANK[getEffectiveLevel(perms, sub.module, sub.submodule)] >= LEVEL_RANK.view) {
      accessibleSubmodules++;
    }
  }

  let capabilities = 0;
  for (const c of CAPABILITY_KEYS) {
    if (perms.capabilities[c] === true) capabilities++;
  }

  return {
    accessibleModules,
    totalModules: MODULE_KEYS.length,
    accessibleSubmodules,
    totalSubmodules,
    capabilities,
  };
}

// ═══════════════════════════════════════════════════════════════
//  SYSTEM ROLE TEMPLATE DEFAULTS
//  (seed: estos se crean como RoleTemplate en la BD)
// ═══════════════════════════════════════════════════════════════

export interface RoleTemplateSeed {
  slug: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissions: RolePermissions;
}

export const ROLE_TEMPLATE_SEEDS: RoleTemplateSeed[] = [
  // ── 7 Roles Activos ──
  {
    slug: "owner",
    name: "Propietario",
    description: "Acceso total a todos los módulos y funciones. No se puede modificar.",
    isSystem: true,
    permissions: DEFAULT_ROLE_PERMISSIONS.owner,
  },
  {
    slug: "admin",
    name: "Administrador",
    description: "Acceso completo a todos los módulos. No puede modificar configuración global.",
    isSystem: true,
    permissions: DEFAULT_ROLE_PERMISSIONS.admin,
  },
  {
    slug: "editor",
    name: "Editor",
    description: "Edición en operaciones, CRM, documentos y CPQ. Payroll y finanzas solo lectura.",
    isSystem: false,
    permissions: DEFAULT_ROLE_PERMISSIONS.editor,
  },
  {
    slug: "jefe_operaciones",
    name: "Jefatura",
    description: "Gestión operativa completa, supervisión, rendiciones. CRM y finanzas solo lectura.",
    isSystem: false,
    permissions: DEFAULT_ROLE_PERMISSIONS.jefe_operaciones,
  },
  {
    slug: "central_monitoreo",
    name: "Central Monitoreo",
    description: "Monitoreo de rondas, supervisión y control nocturno. Sin acceso a CRM ni finanzas.",
    isSystem: false,
    permissions: DEFAULT_ROLE_PERMISSIONS.central_monitoreo,
  },
  {
    slug: "supervisor",
    name: "Supervisor",
    description: "Acceso móvil de terreno para visitas de supervisión, tickets y rendiciones.",
    isSystem: false,
    permissions: DEFAULT_ROLE_PERMISSIONS.supervisor,
  },
  {
    slug: "viewer",
    name: "Visualizador",
    description: "Solo lectura en operaciones, CRM y documentos.",
    isSystem: false,
    permissions: DEFAULT_ROLE_PERMISSIONS.viewer,
  },
  // ── Legacy (mantener por retrocompatibilidad) ──
  {
    slug: "inspector_dt",
    name: "Inspector DT",
    description: "Acceso de solo lectura para inspectores de la Dirección del Trabajo (Res. N°38).",
    isSystem: true,
    permissions: DEFAULT_ROLE_PERMISSIONS.inspector_dt,
  },
];

// ═══════════════════════════════════════════════════════════════
//  PATH → PERMISSION MAPPING
//  (para middleware y page guards)
// ═══════════════════════════════════════════════════════════════

/** Mapea una URL de página a su módulo + submódulo */
export function pathToPermission(
  pathname: string,
): { module: ModuleKey; submodule?: string } | null {
  // Ops submodules
  if (pathname.startsWith("/ops/puestos")) return { module: "ops", submodule: "puestos" };
  if (pathname.startsWith("/ops/pauta-mensual")) return { module: "ops", submodule: "pauta_mensual" };
  if (pathname.startsWith("/ops/pauta-diaria")) return { module: "ops", submodule: "pauta_diaria" };
  if (pathname.startsWith("/ops/turnos-extra")) return { module: "ops", submodule: "turnos_extra" };
  if (pathname.startsWith("/ops/refuerzos")) return { module: "ops", submodule: "turnos_extra" };
  if (pathname.startsWith("/ops/marcaciones")) return { module: "ops", submodule: "marcaciones" };
  if (pathname.startsWith("/ops/ppc")) return { module: "ops", submodule: "ppc" };
  if (pathname.startsWith("/ops/audit-pautas")) return { module: "ops", submodule: "pauta_mensual" };
  if (pathname.startsWith("/ops/control-nocturno")) return { module: "ops", submodule: "control_nocturno" };
  if (pathname.startsWith("/ops/rondas")) return { module: "ops", submodule: "rondas" };
  if (pathname.startsWith("/ops/tickets")) return { module: "ops", submodule: "tickets" };
  if (pathname.startsWith("/ops/supervision")) return { module: "ops", submodule: "supervision" };
  if (pathname.startsWith("/ops/inventario")) return { module: "ops", submodule: "inventario" };
  if (pathname.startsWith("/ops/gamificacion")) return { module: "ops", submodule: "gamificacion" };
  if (pathname.startsWith("/personas/guardias"))
    return { module: "ops", submodule: "guardias" };
  if (pathname === "/ops" || pathname.startsWith("/ops/")) return { module: "ops" };

  // TE → submódulo de ops
  if (pathname.startsWith("/te/")) return { module: "ops", submodule: "turnos_extra" };

  // CRM submodules
  if (pathname.startsWith("/crm/leads")) return { module: "crm", submodule: "leads" };
  if (pathname.startsWith("/crm/accounts")) return { module: "crm", submodule: "accounts" };
  if (pathname.startsWith("/crm/installations")) return { module: "crm", submodule: "installations" };
  if (pathname.startsWith("/crm/contacts")) return { module: "crm", submodule: "contacts" };
  if (pathname.startsWith("/crm/deals")) return { module: "crm", submodule: "deals" };
  if (pathname.startsWith("/crm/cotizaciones")) return { module: "crm", submodule: "quotes" };
  if (pathname === "/crm" || pathname.startsWith("/crm/")) return { module: "crm" };

  // Docs submodules — orden importa: rutas más específicas primero
  if (pathname.startsWith("/opai/documentos/templates"))
    return { module: "docs", submodule: "plantillas" };
  if (pathname.startsWith("/opai/documentos-operativos"))
    return { module: "docs", submodule: "operativos" };
  if (pathname.startsWith("/opai/documentos"))
    return { module: "docs", submodule: "gestion" };

  // Payroll submodules
  if (pathname.startsWith("/payroll/simulator")) return { module: "payroll", submodule: "simulador" };
  if (pathname.startsWith("/payroll/parameters")) return { module: "payroll", submodule: "parametros" };
  if (pathname === "/payroll" || pathname.startsWith("/payroll/")) return { module: "payroll" };

  // CPQ
  if (pathname.startsWith("/cpq")) return { module: "cpq" };

  // Config submodules
  if (pathname.startsWith("/opai/configuracion/usuarios")) return { module: "config", submodule: "usuarios" };
  if (pathname.startsWith("/opai/configuracion/grupos")) return { module: "config", submodule: "grupos" };
  if (pathname.startsWith("/opai/configuracion/integraciones")) return { module: "config", submodule: "integraciones" };
  if (pathname.startsWith("/opai/configuracion/firmas")) return { module: "config", submodule: "firmas" };
  if (pathname.startsWith("/opai/configuracion/categorias-plantillas")) return { module: "config", submodule: "categorias" };
  if (pathname.startsWith("/opai/configuracion/crm")) return { module: "config", submodule: "crm" };
  if (pathname.startsWith("/opai/configuracion/cpq")) return { module: "config", submodule: "cpq" };
  if (pathname.startsWith("/opai/configuracion/payroll")) return { module: "config", submodule: "payroll" };
  if (pathname.startsWith("/opai/configuracion/notificaciones")) return { module: "config", submodule: "notificaciones" };
  if (pathname.startsWith("/opai/configuracion/ops")) return { module: "config", submodule: "ops" };
  if (pathname.startsWith("/opai/configuracion/tipos-ticket")) return { module: "config", submodule: "tipos_ticket" };
  if (pathname.startsWith("/opai/configuracion/finanzas")) return { module: "config", submodule: "finanzas" };
  if (pathname.startsWith("/opai/configuracion/inteligencia-artificial")) return { module: "config", submodule: "inteligencia_artificial" };
  if (pathname.startsWith("/opai/configuracion/empresa")) return { module: "config", submodule: "empresa" };
  if (pathname.startsWith("/opai/configuracion/roles")) return { module: "config", submodule: "roles" };
  if (pathname.startsWith("/opai/configuracion/auditoria")) return { module: "config", submodule: "auditoria" };
  if (pathname.startsWith("/opai/configuracion/documentos-operacionales")) return { module: "config", submodule: "documentos_operacionales" };
  if (pathname.startsWith("/opai/configuracion/mi-plan")) return { module: "config", submodule: "mi_plan" };
  if (pathname.startsWith("/opai/configuracion/cumplimiento")) return { module: "config", submodule: "cumplimiento" };
  if (pathname.startsWith("/opai/configuracion/asistente-ia")) return { module: "config", submodule: "asistente_ia" };
  if (pathname.startsWith("/opai/configuracion/gamificacion")) return { module: "config", submodule: "gamificacion" };
  if (pathname.startsWith("/opai/configuracion/alertas-cobertura")) return { module: "config", submodule: "alertas_cobertura" };
  if (pathname.startsWith("/opai/configuracion/ats")) return { module: "config", submodule: "ats" };
  if (pathname.startsWith("/opai/configuracion/conocimiento")) return { module: "config", submodule: "conocimiento" };
  if (pathname.startsWith("/opai/configuracion")) return { module: "config" };

  // Finance submodules
  if (pathname.startsWith("/finanzas/rendiciones")) return { module: "finance", submodule: "rendiciones" };
  if (pathname.startsWith("/finanzas/aprobaciones")) return { module: "finance", submodule: "aprobaciones" };
  if (pathname.startsWith("/finanzas/pagos")) return { module: "finance", submodule: "pagos" };
  if (pathname.startsWith("/finanzas/reportes")) return { module: "finance", submodule: "reportes" };
  if (pathname.startsWith("/finanzas/contabilidad")) return { module: "finance", submodule: "contabilidad" };
  if (pathname.startsWith("/finanzas/facturacion")) return { module: "finance", submodule: "facturacion" };
  if (pathname.startsWith("/finanzas/proveedores")) return { module: "finance", submodule: "proveedores" };
  if (pathname === "/finanzas" || pathname.startsWith("/finanzas/")) return { module: "finance" };

  // Hub
  if (pathname === "/hub" || pathname.startsWith("/hub/")) return { module: "hub" };

  // Fiscalización DT
  if (pathname.startsWith("/fiscalizacion")) return { module: "fiscalizacion" };

  return null;
}

/** Mapea una URL de API al módulo correspondiente */
export function apiPathToModule(pathname: string): ModuleKey | null {
  if (pathname.startsWith("/api/ops/") || pathname.startsWith("/api/te/") || pathname.startsWith("/api/personas/"))
    return "ops";
  if (pathname.startsWith("/api/crm/")) return "crm";
  if (
    pathname.startsWith("/api/docs/") ||
    pathname === "/api/templates"
  )
    return "docs";
  if (pathname.startsWith("/api/payroll/")) return "payroll";
  if (pathname.startsWith("/api/cpq/")) return "cpq";
  if (pathname.startsWith("/api/finance/")) return "finance";
  if (pathname.startsWith("/api/admin/dt/") || pathname.startsWith("/api/fiscalizacion/")) return "fiscalizacion";
  return null;
}

/** Mapea una URL de API a módulo + submódulo (granular) */
export function apiPathToSubmodule(
  pathname: string,
): { module: ModuleKey; submodule: string } | null {
  // Ops
  if (pathname.startsWith("/api/ops/puestos")) return { module: "ops", submodule: "puestos" };
  if (pathname.startsWith("/api/ops/asignaciones") || pathname.startsWith("/api/ops/pauta-mensual") || pathname.startsWith("/api/ops/series"))
    return { module: "ops", submodule: "pauta_mensual" };
  if (pathname.startsWith("/api/ops/asistencia")) return { module: "ops", submodule: "pauta_diaria" };
  if (pathname.startsWith("/api/ops/marcacion")) return { module: "ops", submodule: "marcaciones" };
  if (pathname.startsWith("/api/ops/control-nocturno")) return { module: "ops", submodule: "control_nocturno" };
  if (pathname.startsWith("/api/ops/rondas")) return { module: "ops", submodule: "rondas" };
  if (pathname.startsWith("/api/ops/tickets") || pathname.startsWith("/api/ops/ticket-categories")) return { module: "ops", submodule: "tickets" };
  if (pathname.startsWith("/api/ops/supervision")) return { module: "ops", submodule: "supervision" };
  if (pathname.startsWith("/api/ops/inventario")) return { module: "ops", submodule: "inventario" };
  if (pathname.startsWith("/api/ops/gamificacion") || pathname.startsWith("/api/gamification")) return { module: "ops", submodule: "gamificacion" };
  if (pathname.startsWith("/api/te/")) return { module: "ops", submodule: "turnos_extra" };
  if (pathname.startsWith("/api/ops/refuerzos")) return { module: "ops", submodule: "turnos_extra" };
  if (pathname.startsWith("/api/personas/guardias")) return { module: "ops", submodule: "guardias" };
  // CRM
  if (pathname.startsWith("/api/crm/leads")) return { module: "crm", submodule: "leads" };
  if (pathname.startsWith("/api/crm/accounts")) return { module: "crm", submodule: "accounts" };
  if (pathname.match(/^\/api\/crm\/installations\/[^/]+\/asignaciones/)) return { module: "crm", submodule: "dotacion" };
  if (pathname.match(/^\/api\/crm\/installations\/[^/]+\/puestos/)) return { module: "crm", submodule: "dotacion" };
  if (pathname.match(/^\/api\/crm\/installations\/[^/]+\/guardias/)) return { module: "crm", submodule: "dotacion" };
  if (pathname.startsWith("/api/crm/installations")) return { module: "crm", submodule: "installations" };
  if (pathname.startsWith("/api/crm/contacts")) return { module: "crm", submodule: "contacts" };
  if (pathname.startsWith("/api/crm/deals")) return { module: "crm", submodule: "deals" };
  // Docs — orden importa: rutas más específicas primero
  if (pathname === "/api/templates" || pathname.startsWith("/api/templates/"))
    return { module: "docs", submodule: "plantillas" };
  if (pathname.startsWith("/api/docs/templates"))
    return { module: "docs", submodule: "plantillas" };
  if (pathname.startsWith("/api/docs/")) return { module: "docs", submodule: "gestion" };
  // Payroll
  if (pathname.startsWith("/api/payroll/simulator")) return { module: "payroll", submodule: "simulador" };
  if (pathname.startsWith("/api/payroll/parameters")) return { module: "payroll", submodule: "parametros" };

  // Finance
  if (pathname.startsWith("/api/finance/rendiciones")) return { module: "finance", submodule: "rendiciones" };
  if (pathname.startsWith("/api/finance/approvals")) return { module: "finance", submodule: "aprobaciones" };
  if (pathname.startsWith("/api/finance/payments")) return { module: "finance", submodule: "pagos" };
  if (pathname.startsWith("/api/finance/reports")) return { module: "finance", submodule: "reportes" };
  if (pathname.startsWith("/api/finance/config") || pathname.startsWith("/api/finance/items") || pathname.startsWith("/api/finance/cost-centers"))
    return { module: "finance", submodule: "configuracion" };
  if (pathname.startsWith("/api/finance/trips")) return { module: "finance", submodule: "rendiciones" };
  if (pathname.startsWith("/api/finance/attachments")) return { module: "finance", submodule: "rendiciones" };
  if (pathname.startsWith("/api/finance/accounting")) return { module: "finance", submodule: "contabilidad" };
  if (pathname.startsWith("/api/finance/billing")) return { module: "finance", submodule: "facturacion" };
  if (pathname.startsWith("/api/finance/purchases")) return { module: "finance", submodule: "proveedores" };

  return null;
}

// ═══════════════════════════════════════════════════════════════
//  VALIDATION
// ═══════════════════════════════════════════════════════════════

/** Valida que un JSON sea un RolePermissions válido */
export function validatePermissions(data: unknown): {
  valid: boolean;
  errors: string[];
  permissions?: RolePermissions;
} {
  const errors: string[] = [];

  if (!data || typeof data !== "object") {
    return { valid: false, errors: ["permissions debe ser un objeto"] };
  }

  const obj = data as Record<string, unknown>;

  // Validate modules
  if (!obj.modules || typeof obj.modules !== "object") {
    errors.push("modules es requerido y debe ser un objeto");
  } else {
    const modules = obj.modules as Record<string, unknown>;
    for (const [key, val] of Object.entries(modules)) {
      if (!MODULE_KEYS.includes(key as ModuleKey)) {
        errors.push(`Módulo desconocido: ${key}`);
      }
      if (!PERMISSION_LEVELS.includes(val as PermissionLevel)) {
        errors.push(`Nivel inválido para módulo ${key}: ${String(val)}`);
      }
    }
  }

  // Validate submodules
  if (obj.submodules && typeof obj.submodules === "object") {
    const subs = obj.submodules as Record<string, unknown>;
    for (const [key, val] of Object.entries(subs)) {
      const parts = key.split(".");
      if (parts.length !== 2) {
        errors.push(`Submódulo inválido: ${key} (formato: modulo.submodulo)`);
        continue;
      }
      const [mod, sub] = parts;
      if (!MODULE_KEYS.includes(mod as ModuleKey)) {
        errors.push(`Módulo desconocido en submódulo: ${mod}`);
      } else {
        const validSubs = SUBMODULE_KEYS[mod as ModuleKey] as readonly string[];
        if (!validSubs.includes(sub)) {
          errors.push(`Submódulo desconocido: ${sub} en módulo ${mod}`);
        }
      }
      if (!PERMISSION_LEVELS.includes(val as PermissionLevel)) {
        errors.push(`Nivel inválido para submódulo ${key}: ${String(val)}`);
      }
    }
  }

  // Validate capabilities
  if (obj.capabilities && typeof obj.capabilities === "object") {
    const caps = obj.capabilities as Record<string, unknown>;
    for (const [key, val] of Object.entries(caps)) {
      if (!CAPABILITY_KEYS.includes(key as CapabilityKey)) {
        errors.push(`Capability desconocida: ${key}`);
      }
      if (typeof val !== "boolean") {
        errors.push(`Capability ${key} debe ser boolean`);
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    permissions: {
      modules: (obj.modules ?? {}) as RolePermissions["modules"],
      submodules: (obj.submodules ?? {}) as RolePermissions["submodules"],
      capabilities: (obj.capabilities ?? {}) as RolePermissions["capabilities"],
    },
  };
}
