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
  ] as const,
  crm: [
    "leads",
    "accounts",
    "installations",
    "contacts",
    "deals",
    "quotes",
  ] as const,
  docs: ["presentaciones", "gestion"] as const,
  payroll: ["simulador", "parametros"] as const,
  cpq: [] as readonly string[],
  config: [
    "usuarios",
    "integraciones",
    "firmas",
    "categorias",
    "crm",
    "cpq",
    "payroll",
    "notificaciones",
    "ops",
  ] as const,
} as const satisfies Record<ModuleKey, readonly string[]>;

// ── Capability keys (acciones especiales no-CRUD) ──

export const CAPABILITY_KEYS = [
  "invite_users",
  "manage_users",
  "te_approve",
  "te_pay",
  "guardias_blacklist",
  "manage_settings",
  "rondas_configure",
  "rondas_resolve_alerts",
] as const;
export type CapabilityKey = (typeof CAPABILITY_KEYS)[number];

// ── Main permissions shape (stored as JSON in DB) ──

export interface RolePermissions {
  modules: Partial<Record<ModuleKey, PermissionLevel>>;
  submodules: Record<string, PermissionLevel>;
  capabilities: Partial<Record<CapabilityKey, boolean>>;
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
}

export const MODULE_META: ModuleMeta[] = [
  { key: "hub", label: "Hub" },
  { key: "ops", label: "Operaciones" },
  { key: "crm", label: "CRM" },
  { key: "docs", label: "Documentos" },
  { key: "payroll", label: "Payroll" },
  { key: "cpq", label: "CPQ" },
  { key: "config", label: "Configuración" },
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
  // ── CRM ──
  { key: "crm.leads", module: "crm", submodule: "leads", label: "Leads", href: "/crm/leads" },
  { key: "crm.accounts", module: "crm", submodule: "accounts", label: "Cuentas", href: "/crm/accounts" },
  { key: "crm.installations", module: "crm", submodule: "installations", label: "Instalaciones", href: "/crm/installations" },
  { key: "crm.contacts", module: "crm", submodule: "contacts", label: "Contactos", href: "/crm/contacts" },
  { key: "crm.deals", module: "crm", submodule: "deals", label: "Negocios", href: "/crm/deals" },
  { key: "crm.quotes", module: "crm", submodule: "quotes", label: "Cotizaciones", href: "/crm/cotizaciones" },
  // ── Docs ──
  { key: "docs.presentaciones", module: "docs", submodule: "presentaciones", label: "Presentaciones", href: "/opai/inicio" },
  { key: "docs.gestion", module: "docs", submodule: "gestion", label: "Gestión documental", href: "/opai/documentos" },
  // ── Payroll ──
  { key: "payroll.simulador", module: "payroll", submodule: "simulador", label: "Simulador", href: "/payroll/simulator" },
  { key: "payroll.parametros", module: "payroll", submodule: "parametros", label: "Parámetros", href: "/payroll/parameters" },
  // ── Config ──
  { key: "config.usuarios", module: "config", submodule: "usuarios", label: "Usuarios", href: "/opai/configuracion/usuarios" },
  { key: "config.integraciones", module: "config", submodule: "integraciones", label: "Integraciones", href: "/opai/configuracion/integraciones" },
  { key: "config.firmas", module: "config", submodule: "firmas", label: "Firmas", href: "/opai/configuracion/firmas" },
  { key: "config.categorias", module: "config", submodule: "categorias", label: "Categorías plantillas", href: "/opai/configuracion/categorias-plantillas" },
  { key: "config.crm", module: "config", submodule: "crm", label: "CRM", href: "/opai/configuracion/crm" },
  { key: "config.cpq", module: "config", submodule: "cpq", label: "CPQ", href: "/opai/configuracion/cpq" },
  { key: "config.payroll", module: "config", submodule: "payroll", label: "Payroll", href: "/opai/configuracion/payroll" },
  { key: "config.notificaciones", module: "config", submodule: "notificaciones", label: "Notificaciones", href: "/opai/configuracion/notificaciones" },
  { key: "config.ops", module: "config", submodule: "ops", label: "Operaciones", href: "/opai/configuracion/ops" },
];

export const CAPABILITY_META: CapabilityMeta[] = [
  { key: "invite_users", label: "Invitar usuarios", description: "Puede enviar invitaciones a nuevos usuarios" },
  { key: "manage_users", label: "Gestionar usuarios", description: "Puede editar roles y desactivar usuarios" },
  { key: "te_approve", label: "Aprobar turnos extra", description: "Puede aprobar o rechazar turnos extra" },
  { key: "te_pay", label: "Generar pagos TE", description: "Puede crear lotes de pago de turnos extra" },
  { key: "guardias_blacklist", label: "Gestionar lista negra", description: "Puede agregar/remover guardias de la lista negra" },
  { key: "manage_settings", label: "Configuración global", description: "Puede modificar configuración general del sistema" },
  { key: "rondas_configure", label: "Configurar rondas", description: "Puede crear/editar checkpoints, plantillas y programación de rondas" },
  { key: "rondas_resolve_alerts", label: "Resolver alertas rondas", description: "Puede marcar como resueltas las alertas de rondas" },
];

// ═══════════════════════════════════════════════════════════════
//  EMPTY & FULL PERMISSION HELPERS
// ═══════════════════════════════════════════════════════════════

export const EMPTY_PERMISSIONS: RolePermissions = {
  modules: {},
  submodules: {},
  capabilities: {},
};

function fullPermissions(): RolePermissions {
  const modules: Partial<Record<ModuleKey, PermissionLevel>> = {};
  for (const m of MODULE_KEYS) modules[m] = "full";
  const capabilities: Partial<Record<CapabilityKey, boolean>> = {};
  for (const c of CAPABILITY_KEYS) capabilities[c] = true;
  return { modules, submodules: {}, capabilities };
}

// ═══════════════════════════════════════════════════════════════
//  DEFAULT PERMISSIONS PER LEGACY ROLE
//  (mapeo exacto de los 11 roles actuales)
// ═══════════════════════════════════════════════════════════════

export const DEFAULT_ROLE_PERMISSIONS: Record<string, RolePermissions> = {
  owner: fullPermissions(),
  admin: fullPermissions(),

  editor: {
    modules: {
      hub: "full",
      ops: "edit",
      crm: "edit",
      docs: "edit",
      payroll: "edit",
      cpq: "edit",
      config: "none",
    },
    submodules: {},
    capabilities: { te_approve: true, rondas_resolve_alerts: true },
  },

  rrhh: {
    modules: {
      hub: "view",
      ops: "edit",
      crm: "none",
      docs: "none",
      payroll: "none",
      cpq: "none",
      config: "none",
    },
    submodules: {},
    capabilities: { guardias_blacklist: true },
  },

  operaciones: {
    modules: {
      hub: "view",
      ops: "edit",
      crm: "none",
      docs: "none",
      payroll: "none",
      cpq: "none",
      config: "none",
    },
    submodules: {},
    capabilities: { te_approve: true, rondas_configure: true, rondas_resolve_alerts: true },
  },

  reclutamiento: {
    modules: {
      hub: "view",
      ops: "edit",
      crm: "none",
      docs: "none",
      payroll: "none",
      cpq: "none",
      config: "none",
    },
    submodules: { "ops.rondas": "none" },
    capabilities: {},
  },

  solo_ops: {
    modules: {
      hub: "view",
      ops: "edit",
      crm: "none",
      docs: "none",
      payroll: "none",
      cpq: "none",
      config: "none",
    },
    submodules: {},
    capabilities: {},
  },

  solo_crm: {
    modules: {
      hub: "view",
      ops: "none",
      crm: "edit",
      docs: "none",
      payroll: "none",
      cpq: "none",
      config: "none",
    },
    submodules: {},
    capabilities: {},
  },

  solo_documentos: {
    modules: {
      hub: "view",
      ops: "none",
      crm: "none",
      docs: "view",
      payroll: "none",
      cpq: "none",
      config: "none",
    },
    submodules: {},
    capabilities: {},
  },

  solo_payroll: {
    modules: {
      hub: "view",
      ops: "none",
      crm: "none",
      docs: "none",
      payroll: "edit",
      cpq: "none",
      config: "none",
    },
    submodules: {},
    capabilities: {},
  },

  viewer: {
    modules: {
      hub: "view",
      ops: "none",
      crm: "none",
      docs: "view",
      payroll: "none",
      cpq: "none",
      config: "none",
    },
    submodules: {},
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
  return DEFAULT_ROLE_PERMISSIONS[role] ?? EMPTY_PERMISSIONS;
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
    description: "Acceso total a todos los módulos y funciones.",
    isSystem: true,
    permissions: DEFAULT_ROLE_PERMISSIONS.admin,
  },
  {
    slug: "editor",
    name: "Editor",
    description: "Puede editar en todos los módulos excepto configuración.",
    isSystem: false,
    permissions: DEFAULT_ROLE_PERMISSIONS.editor,
  },
  {
    slug: "rrhh",
    name: "RRHH",
    description: "Operaciones con foco en gestión de guardias y lista negra.",
    isSystem: false,
    permissions: DEFAULT_ROLE_PERMISSIONS.rrhh,
  },
  {
    slug: "operaciones",
    name: "Operaciones",
    description: "Gestión operativa completa: puestos, pauta, asistencia, turnos extra.",
    isSystem: false,
    permissions: DEFAULT_ROLE_PERMISSIONS.operaciones,
  },
  {
    slug: "reclutamiento",
    name: "Reclutamiento",
    description: "Gestión de guardias para procesos de selección.",
    isSystem: false,
    permissions: DEFAULT_ROLE_PERMISSIONS.reclutamiento,
  },
  {
    slug: "solo_ops",
    name: "Solo Operaciones",
    description: "Acceso exclusivo al módulo de operaciones.",
    isSystem: false,
    permissions: DEFAULT_ROLE_PERMISSIONS.solo_ops,
  },
  {
    slug: "solo_crm",
    name: "Solo CRM",
    description: "Acceso exclusivo al módulo CRM.",
    isSystem: false,
    permissions: DEFAULT_ROLE_PERMISSIONS.solo_crm,
  },
  {
    slug: "solo_documentos",
    name: "Solo Documentos",
    description: "Acceso de visualización al módulo de documentos.",
    isSystem: false,
    permissions: DEFAULT_ROLE_PERMISSIONS.solo_documentos,
  },
  {
    slug: "solo_payroll",
    name: "Solo Payroll",
    description: "Acceso exclusivo al módulo de payroll.",
    isSystem: false,
    permissions: DEFAULT_ROLE_PERMISSIONS.solo_payroll,
  },
  {
    slug: "viewer",
    name: "Viewer",
    description: "Solo lectura en documentos.",
    isSystem: false,
    permissions: DEFAULT_ROLE_PERMISSIONS.viewer,
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
  if (pathname.startsWith("/ops/marcaciones")) return { module: "ops", submodule: "marcaciones" };
  if (pathname.startsWith("/ops/ppc")) return { module: "ops", submodule: "ppc" };
  if (pathname.startsWith("/ops/rondas")) return { module: "ops", submodule: "rondas" };
  if (pathname.startsWith("/personas/guardias") || pathname.startsWith("/personas/lista-negra"))
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

  // Docs submodules
  if (pathname.startsWith("/opai/inicio")) return { module: "docs", submodule: "presentaciones" };
  if (pathname.startsWith("/opai/documentos") || pathname.startsWith("/opai/templates"))
    return { module: "docs", submodule: "gestion" };

  // Payroll submodules
  if (pathname.startsWith("/payroll/simulator")) return { module: "payroll", submodule: "simulador" };
  if (pathname.startsWith("/payroll/parameters")) return { module: "payroll", submodule: "parametros" };
  if (pathname === "/payroll" || pathname.startsWith("/payroll/")) return { module: "payroll" };

  // CPQ
  if (pathname.startsWith("/cpq")) return { module: "cpq" };

  // Config submodules
  if (pathname.startsWith("/opai/configuracion/usuarios")) return { module: "config", submodule: "usuarios" };
  if (pathname.startsWith("/opai/configuracion/integraciones")) return { module: "config", submodule: "integraciones" };
  if (pathname.startsWith("/opai/configuracion/firmas")) return { module: "config", submodule: "firmas" };
  if (pathname.startsWith("/opai/configuracion/categorias-plantillas")) return { module: "config", submodule: "categorias" };
  if (pathname.startsWith("/opai/configuracion/crm")) return { module: "config", submodule: "crm" };
  if (pathname.startsWith("/opai/configuracion/cpq")) return { module: "config", submodule: "cpq" };
  if (pathname.startsWith("/opai/configuracion/payroll")) return { module: "config", submodule: "payroll" };
  if (pathname.startsWith("/opai/configuracion/notificaciones")) return { module: "config", submodule: "notificaciones" };
  if (pathname.startsWith("/opai/configuracion/ops")) return { module: "config", submodule: "ops" };
  if (pathname.startsWith("/opai/configuracion")) return { module: "config" };

  // Hub
  if (pathname === "/hub" || pathname.startsWith("/hub/")) return { module: "hub" };

  return null;
}

/** Mapea una URL de API al módulo correspondiente */
export function apiPathToModule(pathname: string): ModuleKey | null {
  if (pathname.startsWith("/api/ops/") || pathname.startsWith("/api/te/") || pathname.startsWith("/api/personas/"))
    return "ops";
  if (pathname.startsWith("/api/crm/")) return "crm";
  if (
    pathname.startsWith("/api/docs/") ||
    pathname === "/api/presentations" ||
    pathname === "/api/templates"
  )
    return "docs";
  if (pathname.startsWith("/api/payroll/")) return "payroll";
  if (pathname.startsWith("/api/cpq/")) return "cpq";
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
  if (pathname.startsWith("/api/ops/rondas")) return { module: "ops", submodule: "rondas" };
  if (pathname.startsWith("/api/te/")) return { module: "ops", submodule: "turnos_extra" };
  if (pathname.startsWith("/api/personas/guardias")) return { module: "ops", submodule: "guardias" };
  // CRM
  if (pathname.startsWith("/api/crm/leads")) return { module: "crm", submodule: "leads" };
  if (pathname.startsWith("/api/crm/accounts")) return { module: "crm", submodule: "accounts" };
  if (pathname.startsWith("/api/crm/installations")) return { module: "crm", submodule: "installations" };
  if (pathname.startsWith("/api/crm/contacts")) return { module: "crm", submodule: "contacts" };
  if (pathname.startsWith("/api/crm/deals")) return { module: "crm", submodule: "deals" };
  // Docs
  if (pathname === "/api/presentations" || pathname.startsWith("/api/presentations/"))
    return { module: "docs", submodule: "presentaciones" };
  if (pathname === "/api/templates" || pathname.startsWith("/api/templates/"))
    return { module: "docs", submodule: "gestion" };
  if (pathname.startsWith("/api/docs/")) return { module: "docs", submodule: "gestion" };
  // Payroll
  if (pathname.startsWith("/api/payroll/simulator")) return { module: "payroll", submodule: "simulador" };
  if (pathname.startsWith("/api/payroll/parameters")) return { module: "payroll", submodule: "parametros" };

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
