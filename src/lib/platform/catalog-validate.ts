import {
  MODULE_REGISTRY,
  filterKnownModuleKeys,
  isTenantModuleKey,
  type TenantModuleKey,
} from "@/lib/modules/registry";
import { isBetaBlockedForPlan } from "@/lib/platform/module-origin";

const ALL_MODULE_KEYS: TenantModuleKey[] = MODULE_REGISTRY.map((m) => m.key);

export function validateModuleKey(key: string | null | undefined): string | null {
  if (key == null || key === "") return null;
  if (!isTenantModuleKey(key)) return `Módulo desconocido: ${key}`;
  return null;
}

export function validateIncludedModules(
  planSlug: string,
  modules: unknown,
): { ok: true; keys: TenantModuleKey[] } | { ok: false; error: string } {
  if (!Array.isArray(modules) || modules.some((m) => typeof m !== "string")) {
    return { ok: false, error: "includedModules debe ser un arreglo de strings" };
  }
  const slug = planSlug.toLowerCase();
  if (slug === "enterprise") {
    return { ok: true, keys: [...ALL_MODULE_KEYS] };
  }
  const unknown = (modules as string[]).filter((m) => !isTenantModuleKey(m));
  if (unknown.length) {
    return { ok: false, error: `Módulos desconocidos: ${unknown.join(", ")}` };
  }
  const keys = filterKnownModuleKeys(modules as string[]);
  const betaBlocked = keys.filter((k) => isBetaBlockedForPlan(k, slug));
  if (betaBlocked.length) {
    return {
      ok: false,
      error: `Módulos beta no incluibles en ${slug}: ${betaBlocked.join(", ")}`,
    };
  }
  return { ok: true, keys };
}

export function validateAddonPricingModel(
  model: string,
  { allowPerUnit }: { allowPerUnit: boolean },
): string | null {
  if (model === "per_guard" || model === "flat") return null;
  if (model === "per_unit" && allowPerUnit) return null;
  return "pricingModel debe ser per_guard o flat";
}

export function addonsAbsorbedByPlan(
  enabledAddons: { slug: string; moduleKey: string | null }[],
  planModules: Iterable<string>,
): string[] {
  const included = new Set(planModules);
  return enabledAddons
    .filter((a) => a.moduleKey && included.has(a.moduleKey))
    .map((a) => a.slug);
}
