import { describe, it, expect } from "vitest";
import { CHART_OF_ACCOUNTS_CL } from "@/modules/finance/shared/constants/chart-of-accounts-cl";
import {
  DEFAULT_CATEGORY_ACCOUNT_MAP,
  accountCodesForCategory,
  primaryAccountCodeForCategory,
} from "../category-account-defaults";

const SYSTEM_CATEGORY_CODES = [
  "ING_VENTA_CONTRATO", "ING_TURNO_EXTRA", "ING_INSTALACION", "ING_OTRO",
  "EGR_SUELDO", "EGR_QUINCENA", "EGR_PREVIRED", "EGR_TURNO_EXTRA",
  "EGR_TELEFONIA", "EGR_ARRIENDO", "EGR_SERVICIOS", "EGR_PROVEEDOR",
  "EGR_IVA_F29", "EGR_IMPUESTO", "EGR_RETIRO_SOCIO", "EGR_OTRO",
];

describe("category-account-defaults", () => {
  it("maps every system category to at least one account code", () => {
    for (const code of SYSTEM_CATEGORY_CODES) {
      const accounts = accountCodesForCategory(code);
      expect(accounts.length, `category ${code} must have at least one default account`).toBeGreaterThan(0);
    }
  });

  it("every default code references a real account in the chart of accounts", () => {
    const realCodes = new Set(CHART_OF_ACCOUNTS_CL.map((a) => a.code));
    for (const [catCode, accCodes] of Object.entries(DEFAULT_CATEGORY_ACCOUNT_MAP)) {
      for (const ac of accCodes) {
        expect(realCodes.has(ac), `category ${catCode} references non-existent account ${ac}`).toBe(true);
      }
    }
  });

  it("every default code points to an entry-accepting (level 4) account", () => {
    const acceptsEntries = new Set(
      CHART_OF_ACCOUNTS_CL.filter((a) => a.acceptsEntries).map((a) => a.code),
    );
    for (const [catCode, accCodes] of Object.entries(DEFAULT_CATEGORY_ACCOUNT_MAP)) {
      for (const ac of accCodes) {
        expect(acceptsEntries.has(ac), `category ${catCode} → ${ac} must accept entries`).toBe(true);
      }
    }
  });

  it("EGR_TELEFONIA maps to Comunicaciones (6.1.02.003)", () => {
    expect(accountCodesForCategory("EGR_TELEFONIA")).toContain("6.1.02.003");
  });

  it("ING_VENTA_CONTRATO maps to Ingresos por Servicios de Seguridad (4.1.01.001)", () => {
    expect(accountCodesForCategory("ING_VENTA_CONTRATO")).toContain("4.1.01.001");
  });

  it("EGR_SUELDO maps to both operational and admin payroll accounts", () => {
    const accs = accountCodesForCategory("EGR_SUELDO");
    expect(accs).toContain("5.1.01.001"); // Remuneraciones Guardias
    expect(accs).toContain("6.1.01.001"); // Remuneraciones Admin
  });

  it("EGR_IVA_F29 maps to IVA Debito Fiscal (2.1.02.001)", () => {
    expect(accountCodesForCategory("EGR_IVA_F29")).toEqual(["2.1.02.001"]);
  });

  it("primaryAccountCodeForCategory returns first code", () => {
    expect(primaryAccountCodeForCategory("EGR_TELEFONIA")).toBe("6.1.02.003");
  });

  it("primaryAccountCodeForCategory returns null for unknown code", () => {
    expect(primaryAccountCodeForCategory("UNKNOWN_CODE_X")).toBeNull();
  });

  it("accountCodesForCategory returns empty array for unknown code", () => {
    expect(accountCodesForCategory("UNKNOWN_CODE_X")).toEqual([]);
  });
});
