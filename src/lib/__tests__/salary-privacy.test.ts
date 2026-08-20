import { describe, expect, it } from "vitest";
import {
  canViewSensitiveSalary,
  formatMaskedSalaryClp,
  maskSalaryAmount,
  shouldHideSalaryAmount,
} from "../salary-privacy";
import type { RolePermissions } from "../permissions";

function perms(viewSensitive: boolean): RolePermissions {
  return {
    modules: {},
    submodules: {},
    capabilities: { view_sensitive_salary: viewSensitive },
  };
}

describe("salary-privacy", () => {
  it("owner/admin via capability", () => {
    expect(canViewSensitiveSalary(perms(true))).toBe(true);
    expect(canViewSensitiveSalary(perms(false))).toBe(false);
  });

  it("oculta solo cargos sensibles sin capability", () => {
    expect(shouldHideSalaryAmount({ salarySensitive: true, canViewSensitive: false })).toBe(true);
    expect(shouldHideSalaryAmount({ salarySensitive: true, canViewSensitive: true })).toBe(false);
    expect(shouldHideSalaryAmount({ salarySensitive: false, canViewSensitive: false })).toBe(false);
  });

  it("enmascara el monto, no el cargo", () => {
    expect(
      maskSalaryAmount(553_553, { salarySensitive: true, canViewSensitive: false }),
    ).toBeNull();
    expect(formatMaskedSalaryClp(553_553, { salarySensitive: true, canViewSensitive: false })).toBe(
      "—",
    );
    expect(formatMaskedSalaryClp(553_553, { salarySensitive: false, canViewSensitive: false })).toBe(
      "$553.553",
    );
  });
});
