import { describe, expect, it } from "vitest";
import {
  NAV_MODULES,
  isNodeVisible,
  findActiveModule,
  findN3Parent,
  getContextualBottomNavNodes,
  pathMatchesNode,
  type VisibilityContext,
} from "../registry";
import { getDefaultPermissions } from "@/lib/permissions";

const ownerCtx: VisibilityContext = {
  perms: getDefaultPermissions("owner"),
  isAdmin: true,
  isModuleEnabled: () => true,
};

const guardCtx: VisibilityContext = {
  perms: getDefaultPermissions("guardia"),
  isAdmin: false,
  isModuleEnabled: () => true,
};

describe("nav registry", () => {
  describe("NAV_MODULES tree shape", () => {
    it("has all top-level modules", () => {
      const keys = NAV_MODULES.map((m) => m.key).sort();
      expect(keys).toContain("hub");
      expect(keys).toContain("crm");
      expect(keys).toContain("ops");
      expect(keys).toContain("personas");
      expect(keys).toContain("payroll");
      expect(keys).toContain("finance");
      expect(keys).toContain("docs");
      expect(keys).toContain("config");
      expect(keys).toContain("compliance");
    });

    it("config is hideInSidebar (lives in topbar, not sidebar tree)", () => {
      const config = NAV_MODULES.find((m) => m.key === "config")!;
      expect(config.hideInSidebar).toBe(true);
    });

    it("hub groups command-center views as real routes", () => {
      const hub = NAV_MODULES.find((m) => m.key === "hub")!;
      expect(hub.children?.map((child) => child.href)).toEqual([
        "/hub",
        "/hub/comercial",
        "/hub/operaciones",
        "/hub/finanzas",
        "/hub/personas",
        "/hub/payroll",
        "/hub/documentos",
      ]);
      expect(hub.children?.[0]?.exactMatch).toBe(true);
    });

    it("finance-compras-ventas children are real routes (no legacy emitir/notas/recurrentes tabs)", () => {
      const finance = NAV_MODULES.find((m) => m.key === "finance")!;
      const ventas = finance.children?.find((c) => c.key === "finance-compras-ventas");
      const childKeys = (ventas?.children ?? []).map((c) => c.key);
      expect(childKeys).toContain("cv-resumen");
      expect(childKeys).toContain("cv-dtes");
      expect(childKeys).toContain("cv-recibidos");
      expect(childKeys).toContain("cv-programacion");
      expect(childKeys).toContain("cv-libro-iva");
      expect(childKeys).toContain("cv-folios");
      // Acciones (Emitir DTE, Notas Crédito/Débito) ya no son tabs N3.
      expect(childKeys).not.toContain("cv-emitir");
      expect(childKeys).not.toContain("cv-recurrentes");
      expect(childKeys).not.toContain("cv-nc");
      expect(childKeys).not.toContain("cv-nd");
    });

    it("findN3Parent for /finanzas/facturacion/dtes returns finance-compras-ventas", () => {
      expect(findN3Parent("/finanzas/facturacion/dtes")?.key).toBe(
        "finance-compras-ventas",
      );
    });

    it("compliance is visible only when isComplianceVisible is true", () => {
      const compliance = NAV_MODULES.find((m) => m.key === "compliance")!;
      expect(isNodeVisible(compliance, ownerCtx)).toBe(false);
      const cmpVisibleCtx: VisibilityContext = {
        ...ownerCtx,
        isComplianceVisible: true,
      };
      expect(isNodeVisible(compliance, cmpVisibleCtx)).toBe(true);
    });

    it("module keys are unique", () => {
      const keys = NAV_MODULES.map((m) => m.key);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it("all node keys (including children at any depth) are unique", () => {
      const seen = new Set<string>();
      const dups: string[] = [];
      const visit = (n: { key: string; children?: any[] }) => {
        if (seen.has(n.key)) dups.push(n.key);
        seen.add(n.key);
        n.children?.forEach(visit);
      };
      NAV_MODULES.forEach(visit);
      expect(dups).toEqual([]);
    });

    it("hrefs of leaf nodes are non-empty", () => {
      const empty: string[] = [];
      const visit = (n: { key: string; href: string; children?: any[] }) => {
        if (!n.href || n.href === "") empty.push(n.key);
        n.children?.forEach(visit);
      };
      NAV_MODULES.forEach(visit);
      expect(empty).toEqual([]);
    });
  });

  describe("isNodeVisible", () => {
    it("owner sees the CRM module", () => {
      const crm = NAV_MODULES.find((m) => m.key === "crm")!;
      expect(isNodeVisible(crm, ownerCtx)).toBe(true);
    });

    it("guardia (no CRM access by default) does not see CRM module", () => {
      const crm = NAV_MODULES.find((m) => m.key === "crm")!;
      expect(isNodeVisible(crm, guardCtx)).toBe(false);
    });

    it("respects tenant module flag (admin without tenant module = hidden)", () => {
      const ats = NAV_MODULES.find((m) => m.key === "ops")?.children?.find(
        (c) => c.key === "ops-ats",
      );
      const ctxNoAts: VisibilityContext = { ...ownerCtx, isModuleEnabled: (k) => k !== "ats" };
      expect(ats).toBeDefined();
      expect(isNodeVisible(ats!, ctxNoAts)).toBe(false);
      expect(isNodeVisible(ats!, ownerCtx)).toBe(true);
    });

    it("respects adminOnly flag", () => {
      const portales = NAV_MODULES.find((m) => m.key === "portales")!;
      expect(isNodeVisible(portales, ownerCtx)).toBe(true);
      expect(isNodeVisible(portales, guardCtx)).toBe(false);
    });
  });

  describe("findActiveModule", () => {
    it("finds CRM for /crm", () => {
      expect(findActiveModule("/crm")?.key).toBe("crm");
    });
    it("finds CRM for /crm/leads/123", () => {
      expect(findActiveModule("/crm/leads/123")?.key).toBe("crm");
    });
    it("keeps Hub active for grouped command-center routes", () => {
      expect(findActiveModule("/hub/comercial")?.key).toBe("hub");
      expect(findActiveModule("/hub/operaciones")?.key).toBe("hub");
    });
    it("finds Finanzas for /finanzas/reportes/eerr", () => {
      expect(findActiveModule("/finanzas/reportes/eerr")?.key).toBe("finance");
    });
    it("finds Documentos for /opai/documentos-operativos (hermano plano vía activePaths)", () => {
      expect(findActiveModule("/opai/documentos-operativos")?.key).toBe("docs");
      expect(findActiveModule("/opai/documentos-operativos/algo")?.key).toBe("docs");
    });
    it("returns undefined for unknown path", () => {
      expect(findActiveModule("/unknown/path")).toBeUndefined();
    });
  });

  describe("findN3Parent", () => {
    it("finds Reportes (N3 parent) for /finanzas/reportes/eerr", () => {
      const parent = findN3Parent("/finanzas/reportes/eerr");
      expect(parent?.key).toBe("finance-informes");
    });

    it("finds Inventario (N3 parent) for /ops/inventario/productos", () => {
      const parent = findN3Parent("/ops/inventario/productos");
      expect(parent?.key).toBe("ops-inventario");
    });

    it("finds Rondas (N3 parent) for /ops/rondas/monitoreo", () => {
      const parent = findN3Parent("/ops/rondas/monitoreo");
      expect(parent?.key).toBe("ops-rondas");
    });

    it("returns undefined for /hub (no N3)", () => {
      expect(findN3Parent("/hub")).toBeUndefined();
    });
  });

  describe("Banca — N3 + activePaths (rutas hermanas planas)", () => {
    const finance = NAV_MODULES.find((m) => m.key === "finance")!;
    const banca = finance.children!.find((c) => c.key === "finance-banca")!;

    it("finance-banca tiene N3 (flujo-caja / conciliación / cuentas)", () => {
      const childKeys = (banca.children ?? []).map((c) => c.key);
      // banca-flujo-planilla y banca-flujo-caja son gemelos excluyentes por el
      // flag cashflowPlanillaV3 (v3): solo uno es visible a la vez.
      expect(childKeys).toEqual([
        "banca-flujo-planilla",
        "banca-flujo-caja",
        "banca-conciliacion",
        "banca-cuentas",
      ]);
    });

    it("los gemelos de Flujo de Caja se excluyen mutuamente por flag", () => {
      const planilla = banca.children!.find((c) => c.key === "banca-flujo-planilla")!;
      const viejo = banca.children!.find((c) => c.key === "banca-flujo-caja")!;
      const permsAny = {} as never;
      const off = { hasTenantFlag: () => false } as never;
      const on = { hasTenantFlag: (f: string) => f === "cashflowPlanillaV3" } as never;
      expect(planilla.show!(permsAny, off)).toBe(false);
      expect(viejo.show!(permsAny, off)).toBe(true);
      expect(planilla.show!(permsAny, on)).toBe(true);
      expect(viejo.show!(permsAny, on)).toBe(false);
      // Sin ctx (superficies sin flag): comportamiento actual.
      expect(planilla.show!(permsAny, undefined)).toBe(false);
      expect(viejo.show!(permsAny, undefined)).toBe(true);
    });

    it("findActiveModule resuelve finance para /finanzas/flujo-caja", () => {
      expect(findActiveModule("/finanzas/flujo-caja")?.key).toBe("finance");
    });

    it("pathMatchesNode true para sub-ruta de un activePath de Banca", () => {
      expect(pathMatchesNode("/finanzas/flujo-caja/cierre", banca)).toBe(true);
    });

    it("findN3Parent resuelve finance-banca para /finanzas/flujo-caja (activePaths)", () => {
      expect(findN3Parent("/finanzas/flujo-caja")?.key).toBe("finance-banca");
    });

    it("trail de /finanzas/conciliacion = [Finanzas, Banca, Conciliación]", () => {
      // Nivel 1: módulo top-level
      expect(findActiveModule("/finanzas/conciliacion")?.key).toBe("finance");
      // Nivel 2: N2 Banca (via activePaths)
      expect(pathMatchesNode("/finanzas/conciliacion", banca)).toBe(true);
      // Nivel 3: N3 Conciliación
      const concil = banca.children!.find((c) => c.key === "banca-conciliacion")!;
      expect(pathMatchesNode("/finanzas/conciliacion", concil)).toBe(true);
      expect([finance.label, banca.label, concil.label]).toEqual([
        "Finanzas",
        "Banca",
        "Conciliación",
      ]);
    });

    it("getContextualBottomNavNodes devuelve Banca N3 para rutas de Banca", () => {
      for (const r of ["/finanzas/bancos", "/finanzas/flujo-caja", "/finanzas/conciliacion"]) {
        const keys = getContextualBottomNavNodes(r).map((n) => n.key);
        expect(keys).toContain("banca-flujo-caja");
        expect(keys).toContain("banca-conciliacion");
        expect(keys).toContain("banca-cuentas");
      }
    });

    it("rend-historial-pagos reclama /finanzas/pagos vía activePaths", () => {
      const rend = finance.children!.find((c) => c.key === "finance-rendiciones")!;
      const pagos = rend.children!.find((c) => c.key === "rend-historial-pagos")!;
      expect(pathMatchesNode("/finanzas/pagos/abc123", pagos)).toBe(true);
    });
  });

  describe("getContextualBottomNavNodes", () => {
    it("returns Hub grouped views for /hub routes", () => {
      const keys = getContextualBottomNavNodes("/hub/comercial").map(
        (node) => node.key,
      );
      expect(keys).toContain("hub-summary");
      expect(keys).toContain("hub-commercial");
      expect(keys).toContain("hub-operations");
      expect(keys).toContain("hub-finance");
    });

    it("returns Pautas children for /ops/pauta-mensual", () => {
      const nodes = getContextualBottomNavNodes("/ops/pauta-mensual");
      const keys = nodes.map((n) => n.key);
      expect(keys).toContain("pautas-mensual");
      expect(keys).toContain("pautas-diaria");
    });

    it("returns Rondas children for /ops/rondas/monitoreo", () => {
      const nodes = getContextualBottomNavNodes("/ops/rondas/monitoreo");
      const keys = nodes.map((n) => n.key);
      expect(keys).toContain("rondas-monitoreo");
      expect(keys).toContain("rondas-dashboard");
    });

    it("returns Inventario children for /ops/inventario/productos", () => {
      const nodes = getContextualBottomNavNodes("/ops/inventario/productos");
      const keys = nodes.map((n) => n.key);
      expect(keys).toContain("inv-productos");
      expect(keys).toContain("inv-bodegas");
    });

    it("returns Finance N2 children for /finanzas/reportes/balance (PR: bottom nav always N2 in /finanzas)", () => {
      const nodes = getContextualBottomNavNodes("/finanzas/reportes/balance");
      const keys = nodes.map((n) => n.key);
      expect(keys).toContain("finance-rendiciones");
      expect(keys).toContain("finance-compras-ventas");
      expect(keys).toContain("finance-banca");
      expect(keys).toContain("finance-informes");
      expect(keys).not.toContain("rep-balance");
    });

    it("returns Supervision children for /ops/supervision/historial", () => {
      const nodes = getContextualBottomNavNodes("/ops/supervision/historial");
      const keys = nodes.map((n) => n.key);
      expect(keys).toContain("sup-grilla");
      expect(keys).toContain("sup-historial");
    });

    it("returns Ops top-level children for /ops/tickets (no N3)", () => {
      const nodes = getContextualBottomNavNodes("/ops/tickets");
      const keys = nodes.map((n) => n.key);
      expect(keys).toContain("ops-tickets");
      expect(keys).toContain("ops-rondas");
    });

    it("returns Finance N2 children for /finanzas/rendiciones (PR: bottom nav always N2)", () => {
      const nodes = getContextualBottomNavNodes("/finanzas/rendiciones");
      const keys = nodes.map((n) => n.key);
      expect(keys).toContain("finance-rendiciones");
      expect(keys).toContain("finance-compras-ventas");
      expect(keys).toContain("finance-informes");
      expect(keys).not.toContain("rend-historial-pagos");
    });

    it("returns Finance N2 children for /finanzas/rendiciones/historial-pagos (PR: bottom nav always N2)", () => {
      const nodes = getContextualBottomNavNodes(
        "/finanzas/rendiciones/historial-pagos"
      );
      const keys = nodes.map((n) => n.key);
      expect(keys).toContain("finance-rendiciones");
      expect(keys).toContain("finance-banca");
      expect(keys).not.toContain("rend-historial-pagos");
    });

    it("returns Finance N2 children for /finanzas/facturacion (PR: bottom nav always N2)", () => {
      const nodes = getContextualBottomNavNodes("/finanzas/facturacion");
      const keys = nodes.map((n) => n.key);
      expect(keys).toContain("finance-rendiciones");
      expect(keys).toContain("finance-compras-ventas");
      expect(keys).toContain("finance-banca");
      expect(keys).toContain("finance-informes");
      expect(keys).not.toContain("cv-dtes");
    });

    it("returns Finance N2 children for /finanzas/facturacion/dtes (PR: bottom nav always N2)", () => {
      const nodes = getContextualBottomNavNodes("/finanzas/facturacion/dtes");
      const keys = nodes.map((n) => n.key);
      expect(keys).toContain("finance-rendiciones");
      expect(keys).toContain("finance-compras-ventas");
      expect(keys).toContain("finance-banca");
      expect(keys).toContain("finance-informes");
      expect(keys).not.toContain("cv-dtes");
    });

    it("returns [] for an unknown path", () => {
      expect(getContextualBottomNavNodes("/totally/unknown")).toEqual([]);
    });
  });
});
