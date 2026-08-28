import { describe, expect, it } from "vitest";
import {
  applyFinancialRoleLock,
  applyRoleLocks,
  FINANCIAL_CAPABILITIES,
} from "@/lib/financial-access";
import {
  DEFAULT_ROLE_PERMISSIONS,
  ROLE_TEMPLATE_SEEDS,
  canView,
  hasCapability,
  type RolePermissions,
} from "@/lib/permissions";

const FINANCIAL_SUBMODULES = [
  "finance.facturacion",
  "finance.cashflow",
  "finance.contabilidad",
  "finance.reportes",
  "finance.pagos",
] as const;

function clonePerms(perms: RolePermissions): RolePermissions {
  return structuredClone(perms);
}

function lockedFromDefault(role: string): RolePermissions {
  const defaults = DEFAULT_ROLE_PERMISSIONS[role];
  if (!defaults) throw new Error(`sin defaults para ${role}`);
  return applyFinancialRoleLock(role, clonePerms(defaults));
}

function templatePermsForSlug(slug: string): RolePermissions {
  const seed = ROLE_TEMPLATE_SEEDS.find((s) => s.slug === slug);
  if (!seed) throw new Error(`sin seed ${slug}`);
  return seed.permissions as RolePermissions;
}

describe("applyFinancialRoleLock", () => {
  const nonAdminRoles = Object.keys(DEFAULT_ROLE_PERMISSIONS).filter(
    (r) => r !== "owner" && r !== "admin",
  );

  it.each(nonAdminRoles)("%s: ninguna capability financiera queda true", (role) => {
    const perms = lockedFromDefault(role);
    for (const cap of FINANCIAL_CAPABILITIES) {
      expect(hasCapability(perms, cap), `${role}.${cap}`).toBe(false);
    }
  });

  it.each(nonAdminRoles)("%s: finance/cpq/payroll a none salvo rendiciones explícitas", (role) => {
    const perms = lockedFromDefault(role);
    expect(perms.modules.finance).toBe("none");
    expect(perms.modules.cpq).toBe("none");
    expect(perms.modules.payroll).toBe("none");
    expect(canView(perms, "finance", "facturacion")).toBe(false);
    expect(canView(perms, "finance", "cashflow")).toBe(false);
    expect(canView(perms, "finance", "contabilidad")).toBe(false);
    expect(canView(perms, "finance", "reportes")).toBe(false);
    expect(canView(perms, "crm", "deals")).toBe(false);
    expect(canView(perms, "crm", "quotes")).toBe(false);
  });

  it("supervisor y jefe_operaciones conservan finance.rendiciones", () => {
    expect(canView(lockedFromDefault("supervisor"), "finance", "rendiciones")).toBe(true);
    expect(canView(lockedFromDefault("jefe_operaciones"), "finance", "rendiciones")).toBe(true);
    expect(canView(lockedFromDefault("editor"), "finance", "rendiciones")).toBe(true);
  });

  it("un template que activa banking_view no lo reabre en rol no-admin", () => {
    const leaked: RolePermissions = {
      ...clonePerms(DEFAULT_ROLE_PERMISSIONS.supervisor),
      capabilities: {
        ...DEFAULT_ROLE_PERMISSIONS.supervisor.capabilities,
        banking_view: true,
        cashflow_view: true,
        purchases_view: true,
        reports_finance_view: true,
        facturacion_view: true,
      },
      modules: {
        ...DEFAULT_ROLE_PERMISSIONS.supervisor.modules,
        finance: "full",
        cpq: "edit",
        payroll: "view",
      },
      submodules: {
        ...DEFAULT_ROLE_PERMISSIONS.supervisor.submodules,
        "crm.deals": "view",
        "crm.quotes": "view",
        "finance.cashflow": "view",
        "finance.facturacion": "view",
      },
    };
    const locked = applyFinancialRoleLock("supervisor", leaked);
    expect(hasCapability(locked, "banking_view")).toBe(false);
    expect(hasCapability(locked, "cashflow_view")).toBe(false);
    expect(hasCapability(locked, "purchases_view")).toBe(false);
    expect(canView(locked, "finance", "cashflow")).toBe(false);
    expect(canView(locked, "crm", "deals")).toBe(false);
    expect(canView(locked, "finance", "rendiciones")).toBe(true);
  });

  it("owner y admin conservan capabilities financieras (lock es no-op)", () => {
    const owner = applyFinancialRoleLock("owner", clonePerms(DEFAULT_ROLE_PERMISSIONS.owner));
    const admin = applyFinancialRoleLock("admin", clonePerms(DEFAULT_ROLE_PERMISSIONS.admin));
    expect(hasCapability(owner, "banking_view")).toBe(true);
    expect(hasCapability(owner, "cashflow_view")).toBe(true);
    expect(hasCapability(owner, "purchases_view")).toBe(true);
    expect(hasCapability(admin, "banking_view")).toBe(true);
    expect(hasCapability(admin, "cashflow_view")).toBe(true);
    expect(canView(owner, "crm", "deals")).toBe(true);
    expect(canView(admin, "finance", "cashflow")).toBe(true);
  });

  it("applyRoleLocks aplica lock salarial + financiero", () => {
    const leaked: RolePermissions = {
      ...clonePerms(DEFAULT_ROLE_PERMISSIONS.supervisor),
      capabilities: {
        ...DEFAULT_ROLE_PERMISSIONS.supervisor.capabilities,
        banking_view: true,
        view_sensitive_salary: true,
      },
    };
    const locked = applyRoleLocks("supervisor", leaked);
    expect(hasCapability(locked, "banking_view")).toBe(false);
    expect(hasCapability(locked, "view_sensitive_salary")).toBe(false);
  });

  it("seed jefe_operaciones post-lock no ve cashflow ni deals", () => {
    const locked = applyFinancialRoleLock("jefe_operaciones", clonePerms(templatePermsForSlug("jefe_operaciones")));
    expect(hasCapability(locked, "cashflow_view")).toBe(false);
    expect(canView(locked, "finance", "cashflow")).toBe(false);
    expect(canView(locked, "crm", "deals")).toBe(false);
    expect(canView(locked, "finance", "rendiciones")).toBe(true);
  });

  it("submódulos financieros quedan none aunque el módulo padre sea view", () => {
    const perms = applyFinancialRoleLock("viewer", {
      ...clonePerms(DEFAULT_ROLE_PERMISSIONS.viewer),
      modules: { ...DEFAULT_ROLE_PERMISSIONS.viewer.modules, finance: "view" },
    });
    for (const key of FINANCIAL_SUBMODULES) {
      expect(perms.submodules[key], key).toBe("none");
    }
  });
});
