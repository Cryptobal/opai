/**
 * Tenant Module Management — Feature flags por tenant
 *
 * Controla qué módulos tiene habilitado cada tenant según su plan.
 * Cache in-memory de 5 minutos (mismo patrón que tenant-config.ts).
 */

import { prisma } from "@/lib/prisma";

// ── Definición de módulos y planes ──

export const ALL_MODULES = [
  "crm",
  "cpq",
  "ops_asistencia",
  "ops_rondas",
  "ops_pauta",
  "ops_supervision",
  "ops_inventario",
  "documentos",
  "payroll",
  "finanzas",
  "portal_cliente",
  "portal_supervisor",
  "portal_guardia",
  "gamificacion",
  "chat",
  "fiscalizacion",
] as const;

export type TenantModuleKey = (typeof ALL_MODULES)[number];

export const PLAN_MODULES: Record<string, TenantModuleKey[]> = {
  trial: [
    "ops_asistencia",
    "ops_pauta",
    "portal_supervisor",
    "portal_guardia",
  ],
  essential: [
    "ops_asistencia",
    "ops_pauta",
    "ops_rondas",
    "documentos",
    "portal_supervisor",
    "portal_guardia",
  ],
  professional: [
    "crm",
    "ops_asistencia",
    "ops_rondas",
    "ops_pauta",
    "ops_supervision",
    "documentos",
    "portal_cliente",
    "portal_supervisor",
    "portal_guardia",
    "chat",
  ],
  enterprise: [
    "crm",
    "cpq",
    "ops_asistencia",
    "ops_rondas",
    "ops_pauta",
    "ops_supervision",
    "ops_inventario",
    "documentos",
    "payroll",
    "finanzas",
    "portal_cliente",
    "portal_supervisor",
    "portal_guardia",
    "gamificacion",
    "chat",
    "fiscalizacion",
  ],
};

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
 * los módulos (backward compatibility con tenant "gard" existente).
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
