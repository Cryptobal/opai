import { describe, expect, it } from "vitest";
import {
  milestonePayrollKeys,
  payrollChildKeyForClass,
  payrollLinkKeys,
  PAYROLL_CHILD_ACCOUNT_CODES,
} from "../row-keys";

describe("row-keys payroll split", () => {
  it("hito líquido operativo prefiere SUELDO_OPERATIVO y cae a SUELDO", () => {
    expect(milestonePayrollKeys("liquido", "OPERATIVO")).toEqual([
      "SUELDO_OPERATIVO",
      "SUELDO",
    ]);
  });

  it("hito líquido admin prefiere SUELDO_ADMIN", () => {
    expect(milestonePayrollKeys("liquido", "ADMINISTRATIVO")).toEqual([
      "SUELDO_ADMIN",
      "SUELDO",
    ]);
    expect(payrollChildKeyForClass("previred", "ADMINISTRATIVO")).toBe("PREVIRED_ADMIN");
  });

  it("PAYROLL_LIQUIDACION rutea a hijo operativo con fallback al padre", () => {
    expect(payrollLinkKeys("PAYROLL_LIQUIDACION")).toEqual([
      "SUELDO_OPERATIVO",
      "SUELDO",
    ]);
  });

  it("cuentas 5.x vs 6.x por hijo", () => {
    expect(PAYROLL_CHILD_ACCOUNT_CODES.SUELDO_OPERATIVO).toEqual(["5.1.01.001"]);
    expect(PAYROLL_CHILD_ACCOUNT_CODES.SUELDO_ADMIN).toEqual(["6.1.01.001"]);
    expect(PAYROLL_CHILD_ACCOUNT_CODES.PREVIRED_OPERATIVO).toEqual(["5.1.01.002"]);
    expect(PAYROLL_CHILD_ACCOUNT_CODES.PREVIRED_ADMIN).toEqual(["6.1.01.002"]);
  });
});
