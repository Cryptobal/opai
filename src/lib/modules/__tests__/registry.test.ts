import { describe, expect, it } from "vitest";
import {
  MODULE_REGISTRY,
  MODULES_WITHOUT_DEDICATED_ROUTE,
  getModuleDef,
  isTenantModuleKey,
  type TenantModuleKey,
} from "@/lib/modules/registry";
import { ALL_MODULES } from "@/lib/tenant-modules";
import { MODULE_ROUTE_PREFIXES } from "@/lib/tenant-module-routes";

describe("MODULE_REGISTRY", () => {
  it("tiene keys únicos", () => {
    const keys = MODULE_REGISTRY.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("ALL_MODULES deriva del registro y coincide en orden", () => {
    expect(ALL_MODULES).toEqual(MODULE_REGISTRY.map((m) => m.key));
  });

  it("getModuleDef resuelve cada key", () => {
    for (const def of MODULE_REGISTRY) {
      expect(getModuleDef(def.key)?.label).toBe(def.label);
      expect(isTenantModuleKey(def.key)).toBe(true);
    }
    expect(getModuleDef("no_existe")).toBeUndefined();
    expect(isTenantModuleKey("no_existe")).toBe(false);
  });

  it("cada key tiene ≥1 prefijo o está en la allowlist de módulos sin ruta", () => {
    const routed = new Set(MODULE_ROUTE_PREFIXES.map((e) => e.module));
    const allow = new Set<string>(MODULES_WITHOUT_DEDICATED_ROUTE);
    const missing: TenantModuleKey[] = [];
    for (const def of MODULE_REGISTRY) {
      if (!routed.has(def.key) && !allow.has(def.key)) missing.push(def.key);
    }
    expect(missing, `Módulos reales sin ruta ni allowlist: ${missing.join(", ")}`).toEqual([]);
  });

  it("todo prefijo apunta a un key del registro", () => {
    const invalid = MODULE_ROUTE_PREFIXES.filter((e) => !isTenantModuleKey(e.module));
    expect(invalid.map((e) => e.module)).toEqual([]);
  });

  it("la allowlist no incluye módulos que ya tienen prefijo", () => {
    const routed = new Set(MODULE_ROUTE_PREFIXES.map((e) => e.module));
    const redundant = MODULES_WITHOUT_DEDICATED_ROUTE.filter((k) => routed.has(k));
    expect(redundant).toEqual([]);
  });

  it("ops_camaras está marcado beta", () => {
    expect(getModuleDef("ops_camaras")?.beta).toBe(true);
  });
});
