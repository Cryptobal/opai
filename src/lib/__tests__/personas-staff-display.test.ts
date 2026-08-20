import { describe, expect, it } from "vitest";
import {
  pickStaffCargoLabel,
  pickStaffSalaryAmount,
  resolveStaffListDisplay,
} from "../personas-staff-display";

describe("pickStaffCargoLabel", () => {
  it("usa el cargo del puesto antes que cargoStaff", () => {
    expect(
      pickStaffCargoLabel("jefe", { cargoName: "Jefe Operaciones", puestoName: "5x2" }),
    ).toBe("Jefe Operaciones");
  });

  it("cae al nombre del puesto si el cargo CPQ viene vacío", () => {
    expect(
      pickStaffCargoLabel("administrativo", { cargoName: null, puestoName: "Director" }),
    ).toBe("Director");
  });

  it("cae a cargoStaff si no hay asignación", () => {
    expect(pickStaffCargoLabel("gerente", null)).toBe("Gerente");
    expect(pickStaffCargoLabel(null, null)).toBe("Sin cargo");
  });
});

describe("pickStaffSalaryAmount", () => {
  it("PERSONA gana al puesto", () => {
    expect(
      pickStaffSalaryAmount({ personaBaseSalary: 900_000, puestoBaseSalary: 553_553 }),
    ).toEqual({ amount: 900_000, source: "persona" });
  });

  it("usa el puesto si no hay override PERSONA", () => {
    expect(
      pickStaffSalaryAmount({ personaBaseSalary: null, puestoBaseSalary: 553_553 }),
    ).toEqual({ amount: 553_553, source: "puesto" });
  });

  it("trata 0 como ausente", () => {
    expect(
      pickStaffSalaryAmount({ personaBaseSalary: 0, puestoBaseSalary: 0 }),
    ).toEqual({ amount: null, source: null });
  });
});

describe("resolveStaffListDisplay", () => {
  it("resuelve cargo de puesto y sueldo PERSONA, sensibilidad del cargo", () => {
    const row = resolveStaffListDisplay(
      { cargoStaff: "otro", personaBaseSalary: 1_200_000 },
      {
        cargoName: "Director",
        puestoName: "Director Gard",
        puestoBaseSalary: 553_553,
        cargoSalarySensitive: true,
      },
    );
    expect(row.cargoLabel).toBe("Director");
    expect(row.baseSalary).toBe(1_200_000);
    expect(row.salarySource).toBe("persona");
    expect(row.salarySensitive).toBe(true);
  });

  it("Director es sensible aunque el cargo CPQ no tenga el flag", () => {
    const row = resolveStaffListDisplay(
      { cargoStaff: "otro", personaBaseSalary: 550_000 },
      {
        cargoName: "Director",
        puestoName: "Director Gard",
        puestoBaseSalary: 553_553,
        cargoSalarySensitive: false,
      },
    );
    expect(row.salarySensitive).toBe(true);
    expect(row.baseSalary).toBe(550_000);
  });

  it("sin PERSONA usa sueldo del puesto", () => {
    const row = resolveStaffListDisplay(
      { cargoStaff: "jefe", personaBaseSalary: null },
      {
        cargoName: "Reclutador",
        puestoName: "Reclutador",
        puestoBaseSalary: 553_553,
        cargoSalarySensitive: true,
      },
    );
    expect(row.cargoLabel).toBe("Reclutador");
    expect(row.baseSalary).toBe(553_553);
    expect(row.salarySource).toBe("puesto");
  });
});
