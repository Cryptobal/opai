/**
 * Unidades del catálogo CPQ por tipo.
 * El selector de configuración debe respetar unidades de dominio
 * (examen, unidad, comida) y no forzar "mes".
 */

const FALLBACK_UNITS = ["mes", "año", "semestre", "contrato", "unidad"] as const;

export const CATALOG_UNITS_BY_TYPE: Record<string, readonly string[]> = {
  exam: ["examen", "mes", "año", "semestre", "contrato"],
  uniform: ["unidad", "mes", "año", "semestre", "contrato"],
  meal: ["comida", "mes", "año", "semestre", "contrato"],
};

export const DEFAULT_CATALOG_UNIT_BY_TYPE: Record<string, string> = {
  exam: "examen",
  uniform: "unidad",
  meal: "comida",
};

export function defaultCatalogUnit(type: string): string {
  return DEFAULT_CATALOG_UNIT_BY_TYPE[type] ?? "mes";
}

export function catalogUnitOptions(type: string, currentUnit?: string | null): string[] {
  const base = CATALOG_UNITS_BY_TYPE[type]
    ? [...CATALOG_UNITS_BY_TYPE[type]]
    : [...FALLBACK_UNITS];
  const current = currentUnit?.trim();
  if (current && !base.includes(current)) {
    base.unshift(current);
  }
  return base;
}
