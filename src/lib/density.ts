/**
 * DS v4 — densidad tipográfica global.
 *
 * `comfortable` (default) y `compact` se aplican vía `data-density` en el
 * contenedor. Las variables `--t-*` de globals.css reaccionan al atributo.
 * Planillas densas pueden overridear localmente con data-density="compact".
 */

export type Density = "comfortable" | "compact";

export const DEFAULT_DENSITY: Density = "comfortable";

/** Props HTML para el root del AppShell (u otro contenedor de densidad). */
export function densityRootProps(density: Density = DEFAULT_DENSITY): {
  "data-density": Density;
} {
  return { "data-density": density };
}

export function parseDensity(value: string | null | undefined): Density {
  return value === "compact" ? "compact" : "comfortable";
}
