/**
 * Función de normalización de texto para búsqueda — segura para uso en el cliente.
 * No importa Prisma ni ninguna dependencia de servidor.
 *
 * Para las queries SQL con f_unaccent, ver `search-normalize.ts` (solo servidor).
 */

/**
 * Normaliza un texto para comparación: minúsculas + sin diacríticos.
 * Útil en frontend para `fuzzyScore` y resaltado de coincidencias.
 */
export function normalizeForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
