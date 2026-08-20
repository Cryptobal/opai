import { describe, expect, it } from "vitest";
import {
  canViewSensitiveSalary,
  cargoNameImpliesSensitive,
  formatMaskedSalaryClp,
  isSalarySensitiveCargo,
  maskSalaryAmount,
  redactPuestoSalaryFields,
  shouldHideSalaryAmount,
} from "../salary-privacy";
import {
  applySensitiveSalaryRoleLock,
  DEFAULT_ROLE_PERMISSIONS,
  type RolePermissions,
} from "../permissions";

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

describe("cargoNameImpliesSensitive", () => {
  it("marca Director y variantes, no Directorio ni cargos ajenos", () => {
    expect(cargoNameImpliesSensitive("Director")).toBe(true);
    expect(cargoNameImpliesSensitive("Directora")).toBe(true);
    expect(cargoNameImpliesSensitive("Director Administración y Finanzas")).toBe(true);
    expect(cargoNameImpliesSensitive("Subdirector")).toBe(true);
    expect(cargoNameImpliesSensitive("Directorio")).toBe(false);
    expect(cargoNameImpliesSensitive("Jefe Operaciones")).toBe(false);
    expect(cargoNameImpliesSensitive("Reclutador")).toBe(false);
  });
});

describe("isSalarySensitiveCargo", () => {
  it("usa el flag del catálogo o el nombre Director", () => {
    expect(isSalarySensitiveCargo({ salarySensitive: true, names: ["Reclutador"] })).toBe(true);
    expect(isSalarySensitiveCargo({ salarySensitive: false, names: ["Director"] })).toBe(true);
    expect(isSalarySensitiveCargo({ salarySensitive: false, names: ["Jefe"] })).toBe(false);
  });
});

describe("applySensitiveSalaryRoleLock", () => {
  it("deja la capability en owner/admin y la quita en el resto", () => {
    const withCap = perms(true);
    expect(applySensitiveSalaryRoleLock("owner", withCap).capabilities.view_sensitive_salary).toBe(
      true,
    );
    expect(applySensitiveSalaryRoleLock("admin", withCap).capabilities.view_sensitive_salary).toBe(
      true,
    );
    expect(
      applySensitiveSalaryRoleLock("jefe_operaciones", withCap).capabilities.view_sensitive_salary,
    ).toBe(false);
    expect(applySensitiveSalaryRoleLock("editor", withCap).capabilities.view_sensitive_salary).toBe(
      false,
    );
  });

  it("oculta sueldo de un puesto Director aunque el flag esté apagado", () => {
    const hidden = redactPuestoSalaryFields(
      {
        name: "Director Gard",
        baseSalary: 553_553,
        cargo: { name: "Director", salarySensitive: false },
        salaryStructure: { baseSalary: 553_553, netSalaryEstimate: 400_000, colacion: 0, movilizacion: 0 },
      },
      false,
    );
    expect(hidden.baseSalary).toBeNull();
    expect(hidden.salaryStructure?.baseSalary).toBe(0);
  });

  it("solo owner y admin tienen la capability por defecto", () => {
    expect(DEFAULT_ROLE_PERMISSIONS.owner.capabilities.view_sensitive_salary).toBe(true);
    expect(DEFAULT_ROLE_PERMISSIONS.admin.capabilities.view_sensitive_salary).toBe(true);
    expect(DEFAULT_ROLE_PERMISSIONS.editor.capabilities.view_sensitive_salary).not.toBe(true);
    expect(DEFAULT_ROLE_PERMISSIONS.jefe_operaciones.capabilities.view_sensitive_salary).not.toBe(
      true,
    );
    expect(DEFAULT_ROLE_PERMISSIONS.supervisor.capabilities.view_sensitive_salary).not.toBe(true);
  });
});
