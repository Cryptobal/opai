/**
 * Sueldos brutos preconfigurados por Rol × Cargo — parte PURA (client-safe).
 *
 * Este módulo NO importa Prisma ni nada server-only, para poder usarse en
 * componentes cliente (PositionMatrix). La lectura desde la BD vive en
 * `rol-cargo-salary.ts` (server), que re-exporta estos símbolos.
 */

export interface RolCargoSalaryEntry {
  salaryDay: number;
  salaryNight: number;
}

/** rolId → cargoId → { salaryDay, salaryNight } */
export type RolCargoSalaryMap = Record<string, Record<string, RolCargoSalaryEntry>>;

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
