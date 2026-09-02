import { MODULE_REGISTRY, getModuleDef, moduleIsBeta, type TenantModuleKey } from "@/lib/modules/registry";

export type ModuleOrigin = "plan" | "addon" | "manual";

export interface TenantModuleRow {
  key: TenantModuleKey;
  label: string;
  category: string;
  beta: boolean;
  enabled: boolean;
  origin: ModuleOrigin;
  manualOverride: boolean;
}

export function buildTenantModuleRows(input: {
  enabledKeys: Iterable<string>;
  planModules: Iterable<string>;
  addonModuleKeys: Iterable<string>;
}): TenantModuleRow[] {
  const enabled = new Set(input.enabledKeys);
  const plan = new Set(input.planModules);
  const addons = new Set(input.addonModuleKeys);

  return MODULE_REGISTRY.map((def) => {
    const on = enabled.has(def.key);
    const inPlan = plan.has(def.key);
    const inAddon = addons.has(def.key);
    let origin: ModuleOrigin = "manual";
    if (inPlan) origin = "plan";
    else if (inAddon) origin = "addon";
    const expectedOn = inPlan || inAddon;
    return {
      key: def.key,
      label: def.label,
      category: def.category,
      beta: moduleIsBeta(def),
      enabled: on,
      origin,
      manualOverride: on !== expectedOn,
    };
  });
}

export function originLabel(origin: ModuleOrigin): string {
  if (origin === "plan") return "Plan";
  if (origin === "addon") return "Add-on";
  return "Manual";
}

export function isBetaBlockedForPlan(moduleKey: string, planSlug: string): boolean {
  const def = getModuleDef(moduleKey);
  if (!moduleIsBeta(def)) return false;
  const slug = planSlug.toLowerCase();
  return slug === "starter" || slug === "profesional" || slug === "free";
}
