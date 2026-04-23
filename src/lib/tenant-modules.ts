/**
 * Tenant Module Management — Feature flags por tenant
 *
 * Controla qué módulos tiene habilitado cada tenant según su plan.
 * Cache in-memory de 5 minutos (mismo patrón que tenant-config.ts).
 */

import { prisma } from "@/lib/prisma";

// ── Definición de módulos y planes ──

export const ALL_MODULES = [
  // Core
  "hub",
  "config",
  "portal_guardia",
  "portal_marcacion",
  // Operaciones
  "ops_asistencia",
  "ops_pauta",
  "ops_pce",
  "ops_turnos_extra",
  "ops_refuerzos",
  "ops_onboarding",
  "ops_audit",
  "personas",
  "tickets",
  "documentos",
  "contratos",
  // Supervision (Profesional)
  "ops_supervision",
  "portal_supervisor",
  "alertas_cobertura",
  "chat",
  "gamificacion",
  "protocolos_ia",
  "reportes_dt",
  // Add-ons
  "crm",
  "cpq",
  "ops_rondas",
  "ops_inventario",
  "portal_cliente",
  "payroll",
  "finanzas",
  "ats",
  "face_id",
  "ia_operacional",
  "control_acceso",
  "fiscalizacion",
  "control_nocturno",
  "white_label",
  "app_nativa",
  // RRHH — Evaluación Psicolaboral
  "psych",
] as const;

export type TenantModuleKey = (typeof ALL_MODULES)[number];

export const PLAN_MODULES: Record<string, TenantModuleKey[]> = {
  free: [
    "hub", "config", "portal_guardia", "portal_marcacion",
    "ops_asistencia", "ops_pauta",
    "personas", "tickets",
  ],
  starter: [
    "hub", "config", "portal_guardia", "portal_marcacion",
    "ops_asistencia", "ops_pauta", "ops_pce", "ops_turnos_extra",
    "ops_refuerzos", "ops_onboarding", "ops_audit",
    "personas", "tickets", "documentos", "contratos",
    "portal_supervisor",
  ],
  profesional: [
    "hub", "config", "portal_guardia", "portal_marcacion",
    "ops_asistencia", "ops_pauta", "ops_pce", "ops_turnos_extra",
    "ops_refuerzos", "ops_onboarding", "ops_audit",
    "personas", "tickets", "documentos", "contratos",
    "portal_supervisor",
    // Profesional extras
    "ops_supervision", "alertas_cobertura",
    "chat", "gamificacion", "protocolos_ia", "reportes_dt",
  ],
  enterprise: ALL_MODULES.slice() as unknown as TenantModuleKey[],
};
// Backward compatibility aliases
PLAN_MODULES.trial = PLAN_MODULES.free;
PLAN_MODULES.essential = PLAN_MODULES.starter;
PLAN_MODULES.professional = PLAN_MODULES.profesional;

// ── Cache ──

const moduleCache = new Map<string, { modules: Set<string>; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 min

export function clearTenantModuleCache(tenantId?: string): void {
  if (tenantId) {
    moduleCache.delete(tenantId);
  } else {
    moduleCache.clear();
  }
}

// ── Main functions ──

/**
 * Obtiene los módulos habilitados para un tenant.
 * Si el tenant no tiene registros en TenantModule, retorna todos
 * los módulos (backward compatibility con tenants existentes).
 */
export async function getTenantEnabledModules(
  tenantId: string,
): Promise<Set<string>> {
  const cached = moduleCache.get(tenantId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.modules;
  }

  const modules = await prisma.tenantModule.findMany({
    where: { tenantId, enabled: true },
    select: { module: true },
  });

  // Si no hay registros, asumir todos habilitados (backward compat para Gard)
  const moduleSet =
    modules.length > 0
      ? new Set(modules.map((m) => m.module))
      : new Set<string>(ALL_MODULES);

  moduleCache.set(tenantId, { modules: moduleSet, ts: Date.now() });
  return moduleSet;
}

/**
 * Verifica si un módulo específico está habilitado para un tenant.
 */
export async function isTenantModuleEnabled(
  tenantId: string,
  module: TenantModuleKey,
): Promise<boolean> {
  const modules = await getTenantEnabledModules(tenantId);
  return modules.has(module);
}

/**
 * Retorna los módulos habilitados como array (útil para UI).
 */
export async function getTenantModulesList(
  tenantId: string,
): Promise<string[]> {
  const modules = await getTenantEnabledModules(tenantId);
  return Array.from(modules);
}
