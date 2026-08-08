/**
 * Tenant Module Management — Feature flags por tenant
 *
 * Controla qué módulos tiene habilitado cada tenant según su plan.
 * Cache in-memory de 5 minutos (mismo patrón que tenant-config.ts).
 */

import { cache } from "react";
import { revalidateTag, unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

/** Tag de invalidación para módulos, flags y config de un tenant. */
export function tenantContextTag(tenantId: string): string {
  return `tenant-ctx:${tenantId}`;
}

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

// ── Cache (Next.js Data Cache, TTL 300 s) ──

const CACHE_REVALIDATE = 300;

export function clearTenantModuleCache(tenantId?: string): void {
  if (tenantId) {
    revalidateTag(tenantContextTag(tenantId), "max");
  }
}

// ── Main functions ──

/**
 * Obtiene los módulos habilitados para un tenant.
 *
 * Regla:
 * - Cero filas en TenantModule → ALL_MODULES (legado: tenant nunca configurado).
 * - Filas existentes → solo las con enabled=true (puede ser conjunto vacío).
 *   "Todas desactivadas" NO es fail-open.
 */
async function fetchTenantEnabledModuleKeys(tenantId: string): Promise<string[]> {
  const rows = await prisma.tenantModule.findMany({
    where: { tenantId },
    select: { module: true, enabled: true },
  });
  if (rows.length === 0) {
    console.warn(
      "[TENANT_MODULES] tenant sin filas TenantModule, aplicando compat legado",
      { tenantId },
    );
    return [...ALL_MODULES];
  }
  return rows.filter((r) => r.enabled).map((r) => r.module);
}

function getCachedTenantEnabledModuleKeys(tenantId: string): Promise<string[]> {
  return unstable_cache(
    () => fetchTenantEnabledModuleKeys(tenantId),
    ["tenant-enabled-modules", tenantId],
    { revalidate: CACHE_REVALIDATE, tags: [tenantContextTag(tenantId)] },
  )();
}

export async function getTenantEnabledModules(
  tenantId: string,
): Promise<Set<string>> {
  const keys = await getCachedTenantEnabledModuleKeys(tenantId);
  return new Set(keys);
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

async function fetchTenantFeatureFlagKeys(tenantId: string): Promise<string[]> {
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
  return Array.from(flags);
}

function getCachedTenantFeatureFlagKeys(tenantId: string): Promise<string[]> {
  return unstable_cache(
    () => fetchTenantFeatureFlagKeys(tenantId),
    ["tenant-feature-flags", tenantId],
    { revalidate: CACHE_REVALIDATE, tags: [tenantContextTag(tenantId)] },
  )();
}

export async function getTenantFeatureFlags(tenantId: string): Promise<Set<string>> {
  const keys = await getCachedTenantFeatureFlagKeys(tenantId);
  return new Set(keys);
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
