import { describe, expect, it } from "vitest";
import { NAV_MODULES, type NavNode } from "@/lib/nav/registry";
import { ALL_MODULES, type TenantModuleKey } from "@/lib/tenant-modules";
import {
  MODULE_ROUTE_PREFIXES,
  pathToTenantModule,
} from "@/lib/tenant-module-routes";

function collectRegistryTenantModules(nodes: readonly NavNode[]): Set<string> {
  const out = new Set<string>();
  const visit = (node: NavNode) => {
    if (node.tenantModule) out.add(node.tenantModule);
    node.children?.forEach(visit);
  };
  nodes.forEach(visit);
  return out;
}

describe("tenant-module-routes", () => {
  it("incluye todo tenantModule declarado en registry.ts", () => {
    const fromRegistry = collectRegistryTenantModules(NAV_MODULES);
    const fromMap = new Set(MODULE_ROUTE_PREFIXES.map((e) => e.module));
    const missing = [...fromRegistry].filter((m) => !fromMap.has(m as TenantModuleKey));
    expect(missing, `Faltan en el mapa: ${missing.join(", ")}`).toEqual([]);
  });

  it("todo module del mapa pertenece a ALL_MODULES", () => {
    const allowed = new Set<string>(ALL_MODULES);
    const invalid = MODULE_ROUTE_PREFIXES.filter((e) => !allowed.has(e.module));
    expect(invalid.map((e) => e.module)).toEqual([]);
  });

  it("resuelve el prefijo más largo (cpq sobre crm)", () => {
    expect(pathToTenantModule("/crm/cotizaciones")).toBe("cpq");
    expect(pathToTenantModule("/crm/cotizaciones/abc")).toBe("cpq");
    expect(pathToTenantModule("/crm/leads")).toBe("crm");
    expect(pathToTenantModule("/api/cpq/quotes")).toBe("cpq");
    expect(pathToTenantModule("/api/crm/leads")).toBe("crm");
  });

  it("exige límite de segmento (no /crmx)", () => {
    expect(pathToTenantModule("/crmx")).toBeNull();
    expect(pathToTenantModule("/finanzasx")).toBeNull();
    expect(pathToTenantModule("/payroll-extra")).toBeNull();
  });

  it("devuelve null para exclusiones y rutas no mapeadas", () => {
    expect(pathToTenantModule("/hub")).toBeNull();
    expect(pathToTenantModule("/hub/finanzas")).toBeNull();
    expect(pathToTenantModule("/hub/comercial")).toBeNull();
    expect(pathToTenantModule("/api/platform/tenants")).toBeNull();
    expect(pathToTenantModule("/platform")).toBeNull();
    expect(pathToTenantModule("/api/auth/session")).toBeNull();
    expect(pathToTenantModule("/api/tenant/plan")).toBeNull();
    expect(pathToTenantModule("/api/me")).toBeNull();
    expect(pathToTenantModule("/modulo-no-disponible")).toBeNull();
    expect(pathToTenantModule("/opai/configuracion")).toBeNull();
    expect(pathToTenantModule("/ops/tickets")).toBeNull();
    expect(pathToTenantModule("/ops/pauta-mensual")).toBeNull();
  });

  it("documentos bajo /opai gana sobre exclusión /opai", () => {
    expect(pathToTenantModule("/opai/documentos")).toBe("documentos");
    expect(pathToTenantModule("/opai/documentos/templates")).toBe("documentos");
    expect(pathToTenantModule("/opai/documentos-operativos")).toBe("documentos");
    expect(pathToTenantModule("/api/docs/documents")).toBe("documentos");
  });

  it("mapea módulos operativos y portales del registry", () => {
    expect(pathToTenantModule("/ops/rondas/monitoreo")).toBe("ops_rondas");
    expect(pathToTenantModule("/api/ops/rondas/alertas")).toBe("ops_rondas");
    expect(pathToTenantModule("/ops/inventario/productos")).toBe("ops_inventario");
    expect(pathToTenantModule("/ops/supervision/hallazgos")).toBe("ops_supervision");
    expect(pathToTenantModule("/ops/alertas-cobertura")).toBe("alertas_cobertura");
    expect(pathToTenantModule("/ops/ats")).toBe("ats");
    expect(pathToTenantModule("/personas/psicolaboral")).toBe("psych");
    expect(pathToTenantModule("/personas/gamificacion")).toBe("gamificacion");
    expect(pathToTenantModule("/personas/onboarding")).toBe("ops_onboarding");
    expect(pathToTenantModule("/reportes/dt/asistencia-diaria")).toBe("reportes_dt");
    expect(pathToTenantModule("/finanzas/rendiciones")).toBe("finanzas");
    expect(pathToTenantModule("/payroll/periodos")).toBe("payroll");
    expect(pathToTenantModule("/portal/acceso")).toBe("control_acceso");
    expect(pathToTenantModule("/portal/cliente")).toBe("portal_cliente");
    expect(pathToTenantModule("/portal/guardia")).toBe("portal_guardia");
    expect(pathToTenantModule("/portal/marcacion")).toBe("portal_marcacion");
  });
});
