/**
 * Sueldos brutos preconfigurados por Rol × Cargo (cpq.rol_cargo_salary).
 *
 * Cada cruce (rolId, cargoId) puede tener un sueldo bruto distinto para turno
 * diurno y nocturno. El editor de puestos (PositionMatrix) usa estos montos
 * para auto-rellenar el bruto al elegir rol/cargo/turno.
 */
import { prisma } from "@/lib/prisma";

export interface RolCargoSalaryEntry {
  salaryDay: number;
  salaryNight: number;
}

/** rolId → cargoId → { salaryDay, salaryNight } */
export type RolCargoSalaryMap = Record<string, Record<string, RolCargoSalaryEntry>>;

/**
 * Construye el mapa completo de sueldos preconfigurados de un tenant.
 * Multi-tenant: SIEMPRE filtra por tenantId.
 */
export async function getRolCargoSalaryMap(tenantId: string): Promise<RolCargoSalaryMap> {
  const rows = await prisma.cpqRolCargoSalary.findMany({
    where: { tenantId },
    select: { rolId: true, cargoId: true, salaryDay: true, salaryNight: true },
  });

  const map: RolCargoSalaryMap = {};
  for (const row of rows) {
    if (!map[row.rolId]) map[row.rolId] = {};
    map[row.rolId][row.cargoId] = {
      salaryDay: row.salaryDay,
      salaryNight: row.salaryNight,
    };
  }
  return map;
}

/**
 * Resuelve el sueldo bruto preconfigurado para un cruce rol×cargo y turno.
 * Devuelve `null` cuando no hay preconfig (cruce inexistente o monto 0),
 * para que el caller pueda decidir no sobreescribir el bruto actual.
 */
export function resolvePreconfSalary(
  map: RolCargoSalaryMap,
  rolId: string | null | undefined,
  cargoId: string | null | undefined,
  isNight: boolean
): number | null {
  if (!rolId || !cargoId) return null;
  const entry = map[rolId]?.[cargoId];
  if (!entry) return null;
  const value = isNight ? entry.salaryNight : entry.salaryDay;
  return value && value > 0 ? value : null;
}
