import { describe, it, expect } from "vitest";
import type { FinanceCashflowCategory } from "@prisma/client";
import { resolveCategoryForLink, type LinkContext } from "../category-resolver";

const cat = (id: string, code: string): FinanceCashflowCategory =>
  ({ id, code, name: code, kind: "EXPENSE" } as unknown as FinanceCashflowCategory);

describe("resolveCategoryForLink", () => {
  it("EXPENSE link with accountPlanId resolves via map", () => {
    const ctx: LinkContext = {
      targetType: "EXPENSE",
      accountPlanId: "acc-1",
      dteAccountIds: [],
      accountToCategory: new Map([["acc-1", cat("cat-tel", "EGR_TELEFONIA")]]),
    };
    expect(resolveCategoryForLink(ctx)?.id).toBe("cat-tel");
  });

  it("DTE_RECEIVED falls back to DTE line accounts when link has no accountPlanId", () => {
    const ctx: LinkContext = {
      targetType: "DTE_RECEIVED",
      accountPlanId: null,
      dteAccountIds: ["acc-2"],
      accountToCategory: new Map([["acc-2", cat("cat-prov", "EGR_PROVEEDOR")]]),
    };
    expect(resolveCategoryForLink(ctx)?.id).toBe("cat-prov");
  });

  it("DTE_RECEIVED uses link.accountPlanId first if present", () => {
    const ctx: LinkContext = {
      targetType: "DTE_RECEIVED",
      accountPlanId: "acc-direct",
      dteAccountIds: ["acc-line"],
      accountToCategory: new Map([
        ["acc-direct", cat("cat-direct", "EGR_DIRECT")],
        ["acc-line", cat("cat-line", "EGR_LINE")],
      ]),
    };
    expect(resolveCategoryForLink(ctx)?.id).toBe("cat-direct");
  });

  it("PAYROLL_LIQUIDACION → EGR_SUELDO via convention", () => {
    const ctx: LinkContext = {
      targetType: "PAYROLL_LIQUIDACION",
      accountPlanId: null,
      dteAccountIds: [],
      accountToCategory: new Map(),
      payrollSueldoCategoryId: "cat-sueldo",
    };
    expect(resolveCategoryForLink(ctx)?.id).toBe("cat-sueldo");
  });

  it("PAYROLL_ANTICIPO → EGR_QUINCENA via convention", () => {
    const ctx: LinkContext = {
      targetType: "PAYROLL_ANTICIPO",
      accountPlanId: null,
      dteAccountIds: [],
      accountToCategory: new Map(),
      payrollAnticipoCategoryId: "cat-anticipo",
    };
    expect(resolveCategoryForLink(ctx)?.id).toBe("cat-anticipo");
  });

  it("TE_LOTE, TE_ITEM y TE_TURNO → EGR_TURNO_EXTRA via convention", () => {
    for (const targetType of ["TE_LOTE", "TE_ITEM", "TE_TURNO"] as const) {
      const ctx: LinkContext = {
        targetType,
        accountPlanId: null,
        dteAccountIds: [],
        accountToCategory: new Map(),
        payrollTurnoExtraCategoryId: "cat-te",
      };
      expect(resolveCategoryForLink(ctx)?.id).toBe("cat-te");
    }
  });

  it("returns null when no mapping exists", () => {
    const ctx: LinkContext = {
      targetType: "EXPENSE",
      accountPlanId: "acc-orphan",
      dteAccountIds: [],
      accountToCategory: new Map(),
    };
    expect(resolveCategoryForLink(ctx)).toBeNull();
  });

  it("returns null when payroll convention shortcut id is not provided", () => {
    const ctx: LinkContext = {
      targetType: "PAYROLL_LIQUIDACION",
      accountPlanId: null,
      dteAccountIds: [],
      accountToCategory: new Map(),
      // No payrollSueldoCategoryId
    };
    expect(resolveCategoryForLink(ctx)).toBeNull();
  });

  it("DTE_ISSUED with multiple line accounts picks the first that resolves", () => {
    const ctx: LinkContext = {
      targetType: "DTE_ISSUED",
      accountPlanId: null,
      dteAccountIds: ["acc-no-map", "acc-yes-map"],
      accountToCategory: new Map([["acc-yes-map", cat("cat-rev", "ING_VENTA_CONTRATO")]]),
    };
    expect(resolveCategoryForLink(ctx)?.id).toBe("cat-rev");
  });
});
