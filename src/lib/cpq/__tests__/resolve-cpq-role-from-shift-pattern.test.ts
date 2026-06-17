import { describe, expect, it } from "vitest";
import {
  resolveRolIdFromShiftPattern,
  resolveSalaryFromRole,
  resolveTemplateRowCatalog,
} from "../resolve-cpq-role-from-shift-pattern";

const roles = [
  { id: "r-4x4", name: "4x4", salary: 600000 },
  { id: "r-5x2", name: "5x2", salary: 550000 },
  { id: "r-2x5", name: "2x5", salary: 520000 },
];

describe("resolveRolIdFromShiftPattern", () => {
  it("resuelve rol exacto por patrón", () => {
    expect(resolveRolIdFromShiftPattern("4x4", roles, "fallback")).toBe("r-4x4");
    expect(resolveRolIdFromShiftPattern("5x2", roles, "fallback")).toBe("r-5x2");
  });
});

describe("resolveSalaryFromRole", () => {
  it("usa salary del rol cuando está configurado", () => {
    expect(resolveSalaryFromRole("r-4x4", roles, 400000)).toBe(600000);
  });

  it("cae al fallback si el rol no tiene salary", () => {
    expect(resolveSalaryFromRole("r-4x4", [{ id: "r-4x4", name: "4x4" }], 400000)).toBe(400000);
  });
});

describe("resolveTemplateRowCatalog", () => {
  it("prioriza salary CPQ sobre bruto de plantilla", () => {
    const out = resolveTemplateRowCatalog("4x4", roles, "r-5x2", 800000);
    expect(out.rolId).toBe("r-4x4");
    expect(out.baseSalary).toBe(600000);
  });

  it("usa bruto de plantilla si el rol no tiene salary", () => {
    const noSalary = [{ id: "r-4x4", name: "4x4" }];
    const out = resolveTemplateRowCatalog("4x4", noSalary, undefined, 800000);
    expect(out.rolId).toBe("r-4x4");
    expect(out.baseSalary).toBe(800000);
  });
});
