/**
 * Convierte `#RRGGBB` / `#RGB` a componentes HSL del DS (`"H S% L%"`).
 * Usado para inyectar colores de empresa en CSS variables.
 */
export function hexToHslComponents(hex: string): string | null {
  const raw = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(raw)) return null;
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      default:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** Ajusta solo la luminosidad de un string HSL de componentes. */
export function withLightness(hsl: string, lightnessPct: number): string {
  const parts = hsl.trim().split(/\s+/);
  if (parts.length < 3) return hsl;
  return `${parts[0]} ${parts[1]} ${Math.max(0, Math.min(100, lightnessPct))}%`;
}
