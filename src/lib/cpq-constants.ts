/**
 * Constantes CPQ compartidas
 */

/** Nombres de uniformes preseleccionados por defecto (zapato, polar, camisa, pantalon, geologo, chaqueta, velo) */
export const DEFAULT_UNIFORM_NAMES = [
  "zapato",
  "polar",
  "camisa",
  "pantalon",
  "geologo",
  "chaqueta",
  "velo",
] as const;

const DEFAULT_UNIFORM_NAMES_SET = new Set(
  DEFAULT_UNIFORM_NAMES.map((n) => n.toLowerCase())
);

/** Normaliza nombre de catálogo para comparación (sin acentos, minúsculas) */
export function normalizeCatalogName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Indica si un ítem de uniforme debe estar preseleccionado por defecto */
export function isDefaultUniform(name: string): boolean {
  const normalized = normalizeCatalogName(name);
  return DEFAULT_UNIFORM_NAMES_SET.has(normalized);
}
