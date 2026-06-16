/**
 * Sueldos brutos preconfigurados por Rol × Cargo (cpq.rol_cargo_salary).
 *
 * Cada cruce (rolId, cargoId) puede tener un sueldo bruto distinto para turno
 * diurno y nocturno. El editor de puestos (PositionMatrix) usa estos montos
 * para auto-rellenar el bruto al elegir rol/cargo/turno.
 *
 * NOTA: este módulo importa Prisma (server-only). Los componentes cliente deben
 * importar tipos y `resolvePreconfSalary` desde `./rol-cargo-salary-shared`.
 */
import { prisma } from "@/lib/prisma";
import type { RolCargoSalaryMap } from "./rol-cargo-salary-shared";

export {
  resolvePreconfSalary,
  type RolCargoSalaryEntry,
  type RolCargoSalaryMap,
} from "./rol-cargo-salary-shared";

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
