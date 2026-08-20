/**
 * Cargo y sueldo de equipo interno: misma prioridad que un guardia.
 * Puro, sin prisma.
 *
 * 1. Override PERSONA (ficha / sueldo por RUT)
 * 2. Estructura o sueldo del puesto asignado
 * 3. Sin sueldo
 *
 * El cargo visible es el del puesto (catálogo CPQ), no el dropdown corto STAFF_CARGOS.
 */
import { staffCargoLabel } from "@/lib/personas-staff";
import { isSalarySensitiveCargo } from "@/lib/salary-privacy";

export type StaffAssignmentDisplay = {
  cargoName: string | null;
  puestoName: string | null;
  puestoBaseSalary: number | null;
  cargoSalarySensitive: boolean;
};

export type StaffPersonaDisplay = {
  cargoStaff: string | null;
  personaBaseSalary: number | null;
};

export type StaffListDisplay = {
  cargoLabel: string;
  baseSalary: number | null;
  salarySource: "persona" | "puesto" | null;
  salarySensitive: boolean;
};

export function pickStaffCargoLabel(
  cargoStaff: string | null | undefined,
  assignment: Pick<StaffAssignmentDisplay, "cargoName" | "puestoName"> | null,
): string {
  const fromPuesto = assignment?.cargoName?.trim() || assignment?.puestoName?.trim();
  if (fromPuesto) return fromPuesto;
  return staffCargoLabel(cargoStaff);
}

export function pickStaffSalaryAmount(opts: {
  personaBaseSalary: number | null;
  puestoBaseSalary: number | null;
}): { amount: number | null; source: "persona" | "puesto" | null } {
  if (opts.personaBaseSalary != null && opts.personaBaseSalary > 0) {
    return { amount: opts.personaBaseSalary, source: "persona" };
  }
  if (opts.puestoBaseSalary != null && opts.puestoBaseSalary > 0) {
    return { amount: opts.puestoBaseSalary, source: "puesto" };
  }
  return { amount: null, source: null };
}

export function resolveStaffListDisplay(
  persona: StaffPersonaDisplay,
  assignment: StaffAssignmentDisplay | null,
): StaffListDisplay {
  const salary = pickStaffSalaryAmount({
    personaBaseSalary: persona.personaBaseSalary,
    puestoBaseSalary: assignment?.puestoBaseSalary ?? null,
  });
  const cargoLabel = pickStaffCargoLabel(persona.cargoStaff, assignment);
  return {
    cargoLabel,
    baseSalary: salary.amount,
    salarySource: salary.source,
    salarySensitive: isSalarySensitiveCargo({
      salarySensitive: assignment?.cargoSalarySensitive,
      names: [
        assignment?.cargoName,
        assignment?.puestoName,
        persona.cargoStaff,
        cargoLabel,
      ],
    }),
  };
}
