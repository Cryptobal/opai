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
import {
  MODULE_REGISTRY,
  filterKnownModuleKeys,
  normalizePlanSlug,
  starterFallbackModuleKeys,
  type TenantModuleKey,
} from "@/lib/modules/registry";

export type { TenantModuleKey } from "@/lib/modules/registry";
export {
  MODULE_REGISTRY,
  getModuleDef,
  isTenantModuleKey,
  MODULE_CATEGORIES,
  MODULE_CATEGORY_LABELS,
  filterKnownModuleKeys,
  normalizePlanSlug,
} from "@/lib/modules/registry";

/** Tag de invalidación para módulos, flags y config de un tenant. */
export function tenantContextTag(tenantId: string): string {
  return `tenant-ctx:${tenantId}`;
}

// ── Definición de módulos y planes ──

export const ALL_MODULES: readonly TenantModuleKey[] = MODULE_REGISTRY.map((m) => m.key);

/** Sentinel JWT: el tenant tiene acceso a todos los módulos de ALL_MODULES. */
export const TENANT_MODULES_ALL_SENTINEL = "*" as const;
export type TenantModulesToken = TenantModuleKey[] | typeof TENANT_MODULES_ALL_SENTINEL;

/** True si el set/lista contiene todos los módulos del catálogo. */
export function hasAllTenantModules(modules: Iterable<string>): boolean {
  const set = modules instanceof Set ? modules : new Set(modules);
  return ALL_MODULES.every((m) => set.has(m));
}

export async function getCatalogIncludedModules(
  planSlug: string | null | undefined,
): Promise<TenantModuleKey[]> {
  const slug = normalizePlanSlug(planSlug) ?? "starter";
  const catalog = await prisma.planCatalog.findUnique({
    where: { slug },
    select: { includedModules: true },
  });
  let keys = filterKnownModuleKeys(catalog?.includedModules ?? []);
  if (keys.length > 0) return keys;

  if (slug !== "starter") {
    const starter = await prisma.planCatalog.findUnique({
      where: { slug: "starter" },
      select: { includedModules: true },
    });
    keys = filterKnownModuleKeys(starter?.includedModules ?? []);
    if (keys.length > 0) return keys;
  }

  console.error("[TENANT_MODULES] PlanCatalog no resolvió módulos; fallback starter de registro", {
    planSlug,
    slug,
  });
  return starterFallbackModuleKeys();
}

// ── Cache (Next.js Data Cache, TTL 300 s) ──

const CACHE_REVALIDATE = 300;

export function clearTenantModuleCache(tenantId?: string): void {
  if (tenantId) {
    revalidateTag(tenantContextTag(tenantId), "max");
  }
}

/**
 * `unstable_cache` requiere el Data Cache de Next (`incrementalCache`).
 * En callbacks de Auth.js / algunos Route Handlers ese contexto no existe y
 * Next lanza: "Invariant: incrementalCache missing in unstable_cache".
 * En ese caso leemos la BD sin caché (mismo resultado, sin revalidateTag).
 */
function isIncrementalCacheMissing(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes("incrementalCache missing in unstable_cache")
  );
}

async function withDataCacheFallback<T>(
  cached: () => Promise<T>,
  uncached: () => Promise<T>,
): Promise<T> {
  try {
    return await cached();
  } catch (error) {
    if (isIncrementalCacheMissing(error)) {
      return uncached();
    }
    throw error;
  }
}

// ── Main functions ──

/**
 * Obtiene los módulos habilitados para un tenant.
 *
 * Regla:
 * - Cero filas en TenantModule → módulos del PlanCatalog del plan del tenant
 *   (o starter si no resuelve). Nunca ALL_MODULES.
 * - Filas existentes → solo las con enabled=true (puede ser conjunto vacío).
 */
async function fetchTenantEnabledModuleKeys(tenantId: string): Promise<string[]> {
  const rows = await prisma.tenantModule.findMany({
    where: { tenantId },
    select: { module: true, enabled: true },
  });
  if (rows.length === 0) {
    console.error(
      "[TENANT_MODULES] tenant sin filas TenantModule, fail-closed a PlanCatalog",
      { tenantId },
    );
    const plan = await prisma.tenantPlan.findUnique({
      where: { tenantId },
      select: { plan: true },
    });
    const keys = await getCatalogIncludedModules(plan?.plan ?? "starter");
    try {
      await prisma.tenantModule.createMany({
        data: keys.map((module) => ({ tenantId, module, enabled: true })),
        skipDuplicates: true,
      });
    } catch (error) {
      console.error("[TENANT_MODULES] no se pudieron materializar filas", { tenantId, error });
    }
    try {
      const { logPlatformAction, hasPlatformAuditToday } = await import("@/lib/platform/audit");
      const already = await hasPlatformAuditToday({
        tenantId,
        action: "lifecycle.modules_materialized",
      });
      if (!already) {
        await logPlatformAction({
          actorType: "system",
          action: "lifecycle.modules_materialized",
          tenantId,
          targetType: "TenantModule",
          targetId: tenantId,
          after: { modules: keys, plan: plan?.plan ?? null },
        });
      }
    } catch (error) {
      console.error("[TENANT_MODULES] audit modules_materialized failed", { tenantId, error });
    }
    return keys;
  }
  return rows.filter((r) => r.enabled).map((r) => r.module);
}

function getCachedTenantEnabledModuleKeys(tenantId: string): Promise<string[]> {
  return withDataCacheFallback(
    () =>
      unstable_cache(
        () => fetchTenantEnabledModuleKeys(tenantId),
        ["tenant-enabled-modules", tenantId],
        { revalidate: CACHE_REVALIDATE, tags: [tenantContextTag(tenantId)] },
      )(),
    () => fetchTenantEnabledModuleKeys(tenantId),
  );
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
  return withDataCacheFallback(
    () =>
      unstable_cache(
        () => fetchTenantFeatureFlagKeys(tenantId),
        ["tenant-feature-flags", tenantId],
        { revalidate: CACHE_REVALIDATE, tags: [tenantContextTag(tenantId)] },
      )(),
    () => fetchTenantFeatureFlagKeys(tenantId),
  );
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
