/**
 * Mapa declarativo ruta → TenantModuleKey (entitlement de plan).
 *
 * Fuente: nodos de `src/lib/nav/registry.ts` que declaran `tenantModule`,
 * más las rutas API equivalentes. El middleware (`src/proxy.ts`) usa
 * `pathToTenantModule` para enforcement server-side.
 *
 * Diseño: lista de prefijos gatillados (no lista de excluidos).
 * Cualquier ruta no mapeada pasa sin verificación.
 */

import type { TenantModuleKey } from "@/lib/tenant-modules";

export type ModuleRoutePrefix = {
  readonly prefix: string;
  readonly module: TenantModuleKey;
};

/**
 * Prefijos ordenados por longitud descendente en resolución.
 * Ante múltiples coincidencias gana el más largo
 * (ej. `/crm/cotizaciones` → cpq antes que `/crm` → crm).
 */
export const MODULE_ROUTE_PREFIXES: ReadonlyArray<ModuleRoutePrefix> = [
  // ── CPQ (más específico que /crm) ──
  { prefix: "/crm/cotizaciones", module: "cpq" },
  { prefix: "/api/cpq", module: "cpq" },

  // ── CRM ──
  { prefix: "/crm", module: "crm" },
  { prefix: "/api/crm", module: "crm" },

  // ── Finanzas ──
  { prefix: "/finanzas", module: "finanzas" },
  { prefix: "/api/finance", module: "finanzas" },

  // ── Payroll ──
  { prefix: "/payroll", module: "payroll" },
  { prefix: "/api/payroll", module: "payroll" },

  // ── Documentos (viven bajo /opai/documentos*; no mapear /opai genérico) ──
  { prefix: "/opai/documentos-operativos", module: "documentos" },
  { prefix: "/opai/documentos", module: "documentos" },
  { prefix: "/api/docs", module: "documentos" },

  // ── Rondas ──
  { prefix: "/ops/rondas", module: "ops_rondas" },
  { prefix: "/api/ops/rondas", module: "ops_rondas" },
  { prefix: "/portal/rondas", module: "ops_rondas" },
  { prefix: "/api/portal/rondas", module: "ops_rondas" },

  // ── Inventario ──
  { prefix: "/ops/inventario", module: "ops_inventario" },
  { prefix: "/api/ops/inventario", module: "ops_inventario" },

  // ── Supervisión ──
  { prefix: "/ops/supervision", module: "ops_supervision" },
  { prefix: "/api/ops/supervision", module: "ops_supervision" },

  // ── Alertas cobertura ──
  { prefix: "/ops/alertas-cobertura", module: "alertas_cobertura" },
  { prefix: "/api/ops/alertas-cobertura", module: "alertas_cobertura" },

  // ── ATS ──
  { prefix: "/ops/ats", module: "ats" },
  { prefix: "/api/ops/ats", module: "ats" },

  // ── Psicolaboral ──
  { prefix: "/personas/psicolaboral", module: "psych" },
  { prefix: "/api/psych", module: "psych" },

  // ── Gamificación ──
  { prefix: "/personas/gamificacion", module: "gamificacion" },
  { prefix: "/api/gamification", module: "gamificacion" },
  { prefix: "/api/ops/gamificacion", module: "gamificacion" },

  // ── Onboarding ──
  { prefix: "/personas/onboarding", module: "ops_onboarding" },
  { prefix: "/api/onboarding", module: "ops_onboarding" },

  // ── Reportes DT ──
  { prefix: "/reportes/dt", module: "reportes_dt" },
  { prefix: "/api/reportes/dt", module: "reportes_dt" },
  { prefix: "/api/admin/dt", module: "reportes_dt" },

  // ── Portales (páginas admin /portales; portales públicos pasan por isPublicPath) ──
  { prefix: "/portal/cliente", module: "portal_cliente" },
  { prefix: "/api/portal/cliente", module: "portal_cliente" },
  { prefix: "/api/client-portal", module: "portal_cliente" },

  { prefix: "/portal/guardia", module: "portal_guardia" },
  { prefix: "/api/portal/guardia", module: "portal_guardia" },

  { prefix: "/portal/marcacion", module: "portal_marcacion" },
  { prefix: "/api/portal/marcacion", module: "portal_marcacion" },

  { prefix: "/portal/acceso", module: "control_acceso" },
  { prefix: "/api/access-control", module: "control_acceso" },
] as const;

/**
 * Prefijos que NUNCA se gatillan, aunque coincidan con una entrada del mapa
 * de igual o menor especificidad. Un match de mapa más largo que la exclusión
 * gana (ej. `/opai/documentos` sobre exclusión `/opai`).
 */
export const MODULE_ROUTE_EXCLUSIONS: readonly string[] = [
  "/api/platform",
  "/platform",
  "/api/auth",
  "/hub",
  "/config",
  "/opai",
  "/api/tenant",
  "/api/me",
  "/modulo-no-disponible",
] as const;

/** Coincidencia por prefijo de segmento completo: `/crm` ↔ `/crm` y `/crm/x`, no `/crmx`. */
export function matchesPathPrefix(pathname: string, prefix: string): boolean {
  if (pathname === prefix) return true;
  if (pathname.startsWith(prefix + "/")) return true;
  return false;
}

function longestMatchingPrefix(
  pathname: string,
  prefixes: readonly string[],
): string | null {
  let best: string | null = null;
  for (const prefix of prefixes) {
    if (!matchesPathPrefix(pathname, prefix)) continue;
    if (best === null || prefix.length > best.length) best = prefix;
  }
  return best;
}

/**
 * Resuelve el TenantModuleKey requerido por una ruta, o null si no aplica.
 */
export function pathToTenantModule(pathname: string): TenantModuleKey | null {
  let bestPrefix: string | null = null;
  let bestModule: TenantModuleKey | null = null;

  for (const entry of MODULE_ROUTE_PREFIXES) {
    if (!matchesPathPrefix(pathname, entry.prefix)) continue;
    if (bestPrefix === null || entry.prefix.length > bestPrefix.length) {
      bestPrefix = entry.prefix;
      bestModule = entry.module;
    }
  }

  if (bestPrefix === null || bestModule === null) return null;

  const exclusion = longestMatchingPrefix(pathname, MODULE_ROUTE_EXCLUSIONS);
  if (exclusion !== null && exclusion.length >= bestPrefix.length) {
    return null;
  }

  return bestModule;
}
