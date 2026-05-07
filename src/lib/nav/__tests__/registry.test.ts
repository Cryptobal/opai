import { describe, expect, it } from "vitest";
import {
  NAV_MODULES,
  isNodeVisible,
  findActiveModule,
  findN3Parent,
  getContextualBottomNavNodes,
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
    it("finds Finanzas for /finanzas/reportes/eerr", () => {
      expect(findActiveModule("/finanzas/reportes/eerr")?.key).toBe("finance");
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

  describe("getContextualBottomNavNodes", () => {
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

    it("returns Reportes children for /finanzas/reportes/balance", () => {
      const nodes = getContextualBottomNavNodes("/finanzas/reportes/balance");
      const keys = nodes.map((n) => n.key);
      expect(keys).toContain("rep-dashboard");
      expect(keys).toContain("rep-balance");
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

    it("returns Finanzas top-level children for /finanzas/rendiciones", () => {
      const nodes = getContextualBottomNavNodes("/finanzas/rendiciones");
      const keys = nodes.map((n) => n.key);
      expect(keys).toContain("finance-rendiciones");
      expect(keys).toContain("finance-ventas");
    });

    it("returns [] for an unknown path", () => {
      expect(getContextualBottomNavNodes("/totally/unknown")).toEqual([]);
    });
  });
});
