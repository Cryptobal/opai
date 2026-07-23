import { describe, expect, it } from "vitest";
import { getDefaultPermissions } from "@/lib/permissions";
import type { VisibilityContext } from "@/lib/nav/registry";
import {
  getActiveHubViewHref,
  getHubViewOptions,
} from "../hub-view-options";

function ctxFor(
  role: string,
  enabledModules?: Set<string>,
): VisibilityContext {
  return {
    perms: getDefaultPermissions(role),
    isAdmin: role === "owner" || role === "admin",
    isModuleEnabled: (mod) => !enabledModules || enabledModules.has(mod),
  };
}

describe("getHubViewOptions", () => {
  it("owner con todos los módulos → 7 vistas con terminología de Control", () => {
    const options = getHubViewOptions(ctxFor("owner"));
    expect(options.map((o) => o.href)).toEqual([
      "/hub",
      "/hub/comercial",
      "/hub/operaciones",
      "/hub/finanzas",
      "/hub/personas",
      "/hub/payroll",
      "/hub/documentos",
    ]);
    const labels = new Map(options.map((o) => [o.href, o.label]));
    expect(labels.get("/hub")).toBe("General");
    // "Control comercial" (dashboard del Hub) ≠ "Comercial" (módulo CRM real)
    expect(labels.get("/hub/comercial")).toBe("Control comercial");
    expect(labels.get("/hub/operaciones")).toBe("Control operacional");
    expect(labels.get("/hub/finanzas")).toBe("Control financiero");
  });

  it("respeta permisos del rol: sin acceso CRM no aparece Control comercial", () => {
    const options = getHubViewOptions(ctxFor("guardia"));
    const hrefs = options.map((o) => o.href);
    expect(hrefs).not.toContain("/hub/comercial");
    expect(hrefs).not.toContain("/hub/finanzas");
  });

  it("respeta tenant scoping: módulo crm deshabilitado oculta Control comercial", () => {
    const enabled = new Set(["finanzas", "payroll", "documentos"]);
    const options = getHubViewOptions(ctxFor("owner", enabled));
    expect(options.map((o) => o.href)).not.toContain("/hub/comercial");
  });
});

describe("getActiveHubViewHref", () => {
  const options = getHubViewOptions(ctxFor("owner"));

  it("resuelve /hub → General (exactMatch)", () => {
    expect(getActiveHubViewHref("/hub", options)).toBe("/hub");
  });

  it("resuelve /hub/comercial → Control comercial", () => {
    expect(getActiveHubViewHref("/hub/comercial", options)).toBe("/hub/comercial");
  });

  it("resuelve sub-rutas por prefijo", () => {
    expect(getActiveHubViewHref("/hub/operaciones", options)).toBe("/hub/operaciones");
    expect(getActiveHubViewHref("/hub/payroll", options)).toBe("/hub/payroll");
  });
});
