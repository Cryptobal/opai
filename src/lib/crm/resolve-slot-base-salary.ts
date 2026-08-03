/**
 * Bruto CLP a materializar / mostrar en Plan: puesto editado > piso pliego > default.
 * Puro (sin Prisma) para poder usarlo desde componentes cliente.
 */
export function resolveSlotBaseSalary(
  slotBaseSalary: number | null | undefined,
  floorFromPliego: number | null | undefined,
  fallback = 550000,
): number {
  if (
    typeof slotBaseSalary === "number" &&
    Number.isFinite(slotBaseSalary) &&
    slotBaseSalary > 0
  ) {
    return Math.round(slotBaseSalary);
  }
  if (
    typeof floorFromPliego === "number" &&
    Number.isFinite(floorFromPliego) &&
    floorFromPliego > 0
  ) {
    return Math.round(floorFromPliego);
  }
  return fallback;
}
