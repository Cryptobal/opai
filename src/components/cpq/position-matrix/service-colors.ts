/**
 * Paleta de colores para diferenciar visualmente cada servicio (grupo) en la
 * matriz de puestos. Los colores se eligen para leer bien en light y dark.
 *
 * - Si el grupo tiene `colorHex` definido (elegido por el usuario), se usa ese.
 * - Si no, se autoasigna de la paleta por índice (estable y consistente).
 */

/** Paleta base (mid-tone, distinguible, sin rojo "danger" puro). */
export const SERVICE_COLOR_PALETTE: string[] = [
  "#10b981", // emerald
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#f59e0b", // amber
  "#14b8a6", // teal
  "#ec4899", // pink
  "#6366f1", // indigo
  "#f97316", // orange
  "#06b6d4", // cyan
  "#a855f7", // purple
  "#84cc16", // lime
  "#0ea5e9", // sky
];

/** Color resuelto para un servicio: su colorHex o el de la paleta por índice. */
export function resolveServiceColor(
  colorHex: string | null | undefined,
  index: number,
): string {
  if (colorHex && /^#?[0-9a-fA-F]{6}$/.test(colorHex.trim())) {
    const c = colorHex.trim();
    return c.startsWith("#") ? c : `#${c}`;
  }
  return SERVICE_COLOR_PALETTE[index % SERVICE_COLOR_PALETTE.length];
}

/** Convierte un hex (#rrggbb) a rgba con la opacidad dada. */
export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return hex;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
