/**
 * Registro único de módulos de tenant.
 * Fuente de verdad de keys, etiquetas y categorías.
 * Plan → módulos vive en PlanCatalog.includedModules, no aquí.
 */

export const MODULE_CATEGORIES = ["core", "operaciones", "profesional", "addon"] as const;
export type ModuleCategory = (typeof MODULE_CATEGORIES)[number];

export interface ModuleDef {
  key: string;
  label: string;
  category: ModuleCategory;
  description?: string;
  beta?: boolean;
}

export const MODULE_REGISTRY = [
  // Core
  { key: "hub", label: "Hub (Dashboard)", category: "core" },
  { key: "config", label: "Configuración", category: "core" },
  { key: "portal_guardia", label: "Portal Guardia", category: "core" },
  { key: "portal_marcacion", label: "Portal Marcación", category: "core" },
  { key: "ops_asistencia", label: "Asistencia", category: "core" },
  { key: "ops_pauta", label: "Pautas", category: "core" },
  { key: "personas", label: "Personas", category: "core" },
  { key: "tickets", label: "Tickets", category: "core" },
  // Operaciones
  { key: "ops_pce", label: "PCE", category: "operaciones" },
  { key: "ops_turnos_extra", label: "Turnos Extra", category: "operaciones" },
  { key: "ops_refuerzos", label: "Refuerzos", category: "operaciones" },
  { key: "ops_onboarding", label: "Onboarding Digital", category: "operaciones" },
  { key: "ops_audit", label: "Log de Auditoría", category: "operaciones" },
  { key: "documentos", label: "Documentos", category: "operaciones" },
  { key: "contratos", label: "Contratos", category: "operaciones" },
  // Profesional
  { key: "ops_supervision", label: "Supervisión de Campo GPS", category: "profesional" },
  { key: "alertas_cobertura", label: "Alertas de Cobertura", category: "profesional" },
  { key: "chat", label: "Chat Real-time", category: "profesional" },
  { key: "gamificacion", label: "Gamificación", category: "profesional" },
  { key: "protocolos_ia", label: "Protocolos IA", category: "profesional" },
  { key: "reportes_dt", label: "Reportes DT", category: "profesional" },
  // Add-ons
  { key: "crm", label: "CRM Comercial", category: "addon" },
  { key: "cpq", label: "CPQ (Cotizador)", category: "addon" },
  { key: "ops_rondas", label: "Rondas GPS", category: "addon" },
  { key: "ops_inventario", label: "Inventario", category: "addon" },
  {
    key: "ops_camaras",
    label: "Cámaras IP",
    category: "addon",
    description: "Live viewing vía relay. Solo Enterprise o override manual.",
    beta: true,
  },
  { key: "portal_cliente", label: "Portal Cliente", category: "addon" },
  { key: "payroll", label: "Payroll / Nómina", category: "addon" },
  { key: "finanzas", label: "Finanzas + DTE", category: "addon" },
  { key: "ats", label: "ATS / Reclutamiento", category: "addon" },
  { key: "face_id", label: "Face ID Biométrico", category: "addon" },
  { key: "ia_operacional", label: "IA Operacional", category: "addon" },
  { key: "control_acceso", label: "Control de Acceso", category: "addon" },
  { key: "fiscalizacion", label: "Fiscalización DT", category: "addon" },
  { key: "control_nocturno", label: "Control Nocturno IA", category: "addon" },
  { key: "white_label", label: "White-label", category: "addon" },
  { key: "app_nativa", label: "App iOS/Android", category: "addon" },
  { key: "psych", label: "Evaluación Psicolaboral", category: "addon" },
] as const satisfies readonly ModuleDef[];

export type TenantModuleKey = (typeof MODULE_REGISTRY)[number]["key"];

export const MODULE_CATEGORY_LABELS: Record<ModuleCategory, string> = {
  core: "Core",
  operaciones: "Operaciones",
  profesional: "Profesional",
  addon: "Add-on",
};

/**
 * Módulos sin prefijo propio en tenant-module-routes.ts.
 * Viven bajo rutas compartidas (/ops, /personas, /chat) o no tienen superficie web
 * (white_label, app_nativa). No allowlistear un módulo nuevo a ciegas: o se
 * agrega el prefijo o se justifica acá.
 */
export const MODULES_WITHOUT_DEDICATED_ROUTE: readonly TenantModuleKey[] = [
  "hub",
  "config",
  "ops_asistencia",
  "ops_pauta",
  "ops_pce",
  "ops_turnos_extra",
  "ops_refuerzos",
  "ops_audit",
  "personas",
  "tickets",
  "contratos",
  "chat",
  "protocolos_ia",
  "face_id",
  "ia_operacional",
  "fiscalizacion",
  "control_nocturno",
  "white_label",
  "app_nativa",
];

const BY_KEY = new Map<string, (typeof MODULE_REGISTRY)[number]>(
  MODULE_REGISTRY.map((m) => [m.key, m]),
);

export function getModuleDef(key: string): (typeof MODULE_REGISTRY)[number] | undefined {
  return BY_KEY.get(key);
}

export function isTenantModuleKey(key: string): key is TenantModuleKey {
  return BY_KEY.has(key);
}

export function filterKnownModuleKeys(keys: readonly string[]): TenantModuleKey[] {
  return keys.filter(isTenantModuleKey);
}

export function normalizePlanSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  const map: Record<string, string> = {
    trial: "free",
    essential: "starter",
    professional: "profesional",
  };
  return map[slug] ?? slug;
}

/** Fallback de último recurso si el catálogo no resuelve ni starter. Nunca ALL_MODULES. */
export function starterFallbackModuleKeys(): TenantModuleKey[] {
  return MODULE_REGISTRY.filter((m) => m.category === "core" || m.category === "operaciones").map(
    (m) => m.key,
  );
}
