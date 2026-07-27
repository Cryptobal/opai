/**
 * Tenant Module Management — Feature flags por tenant
 *
 * Controla qué módulos tiene habilitado cada tenant según su plan.
 * Cache in-memory de 5 minutos (mismo patrón que tenant-config.ts).
 */

import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

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
  ],
  profesional: [
    "hub", "config", "portal_guardia", "portal_marcacion",
    "ops_asistencia", "ops_pauta", "ops_pce", "ops_turnos_extra",
    "ops_refuerzos", "ops_onboarding", "ops_audit",
    "personas", "tickets", "documentos", "contratos",
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
    flagCache.delete(tenantId);
  } else {
    moduleCache.clear();
    flagCache.clear();
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
 * React.cache evita repetir la query cuando layout + page la piden
 * en la misma request (p.ej. `/productividad`).
 */
export const getTenantModulesList = cache(async function getTenantModulesList(
  tenantId: string,
): Promise<string[]> {
  const modules = await getTenantEnabledModules(tenantId);
  return Array.from(modules);
});

// ── Feature flags finos por tenant (TenantModule.config JSONB) ──
// Un flag es una key con valor truthy dentro del `config` de cualquier fila
// TenantModule del tenant (ej. module="finanzas", config={cashflowPlanillaV3:true}).
// Mecanismo aditivo: cero migración, se administra con un UPDATE al JSONB.

const flagCache = new Map<string, { flags: Set<string>; ts: number }>();

export async function getTenantFeatureFlags(tenantId: string): Promise<Set<string>> {
  const cached = flagCache.get(tenantId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.flags;

  const rows = await prisma.tenantModule.findMany({
    where: { tenantId, enabled: true, config: { not: Prisma.DbNull } },
    select: { config: true },
  });
  const flags = new Set<string>();
  for (const r of rows) {
    const cfg = r.config as Record<string, unknown> | null;
    if (!cfg || typeof cfg !== "object") continue;
    for (const [k, v] of Object.entries(cfg)) if (v === true) flags.add(k);
  }
  flagCache.set(tenantId, { flags, ts: Date.now() });
  return flags;
}

export async function getTenantFeatureFlagsList(tenantId: string): Promise<string[]> {
  return Array.from(await getTenantFeatureFlags(tenantId));
}

export async function isTenantFeatureFlagEnabled(
  tenantId: string,
  flag: string,
): Promise<boolean> {
  const flags = await getTenantFeatureFlags(tenantId);
  return flags.has(flag);
}
