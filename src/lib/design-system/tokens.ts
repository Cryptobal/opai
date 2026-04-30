/**
 * OPAI Refined Industrial — Design Tokens (TS contract)
 *
 * Estos helpers exponen el sistema de tokens del DS como tipos TS para
 * autocomplete y como helpers de className. NO duplican valores de color:
 * los valores reales viven en `src/styles/globals.css` (CSS variables).
 *
 * Si el contrato cambia (renombrar token, agregar tono), se modifica acá
 * y TypeScript marca todos los lugares que lo consumen.
 *
 * Ver también: docs/design-system/README.md
 */

// ───────────────────────────────────────────────────────────────────
// Surfaces — 5 niveles de elevación. 0=canvas, 4=tooltip.
// ───────────────────────────────────────────────────────────────────
export const SURFACE_LEVELS = [0, 1, 2, 3, 4] as const;
export type SurfaceLevel = (typeof SURFACE_LEVELS)[number];

// ───────────────────────────────────────────────────────────────────
// Text scale — 4 niveles. 1=primary, 4=tertiary/placeholder.
// ───────────────────────────────────────────────────────────────────
export const TEXT_LEVELS = [1, 2, 3, 4] as const;
export type TextLevel = (typeof TEXT_LEVELS)[number];

// ───────────────────────────────────────────────────────────────────
// Borders — 3 pesos.
// ───────────────────────────────────────────────────────────────────
export const BORDER_WEIGHTS = ["subtle", "default", "strong"] as const;
export type BorderWeight = (typeof BORDER_WEIGHTS)[number];

// ───────────────────────────────────────────────────────────────────
// Radius scale.
// sm=6px, md=10px, lg=14px, xl=20px, pill=999px.
// ───────────────────────────────────────────────────────────────────
export const RADIUS_SCALE = ["sm", "md", "lg", "xl", "pill"] as const;
export type RadiusScale = (typeof RADIUS_SCALE)[number];

// ───────────────────────────────────────────────────────────────────
// Shadow scale.
// xs=hairline, sm=card resting, md=card hovered, lg=elevated overlay.
// ───────────────────────────────────────────────────────────────────
export const SHADOW_SCALE = ["xs", "sm", "md", "lg"] as const;
export type ShadowScale = (typeof SHADOW_SCALE)[number];

// ───────────────────────────────────────────────────────────────────
// Status — semánticos. NO mezclar con tones categóricos.
// ───────────────────────────────────────────────────────────────────
export const STATUS_KINDS = ["ok", "warn", "danger", "info"] as const;
export type StatusKind = (typeof STATUS_KINDS)[number];

// ───────────────────────────────────────────────────────────────────
// Tones — categóricos. Para IconTile y agrupaciones visuales NO
// semánticas (ej: secciones del módulo, tipos de movimiento, etc.).
// NO usar como reemplazo de status — un "warn" debe ir en warn-soft,
// no en tint-amber, aunque visualmente sean similares.
// ───────────────────────────────────────────────────────────────────
export const TONES = [
  "violet",
  "rose",
  "amber",
  "emerald",
  "sky",
  "teal",
] as const;
export type Tone = (typeof TONES)[number];

// Mappings explícitos — Tailwind JIT NO detecta clases armadas con
// template strings dinámicos. Cada par debe aparecer literal en código.
const TONE_BG: Record<Tone, string> = {
  violet: "bg-tint-violet",
  rose: "bg-tint-rose",
  amber: "bg-tint-amber",
  emerald: "bg-tint-emerald",
  sky: "bg-tint-sky",
  teal: "bg-tint-teal",
};

const TONE_FG: Record<Tone, string> = {
  violet: "text-tint-violet-fg",
  rose: "text-tint-rose-fg",
  amber: "text-tint-amber-fg",
  emerald: "text-tint-emerald-fg",
  sky: "text-tint-sky-fg",
  teal: "text-tint-teal-fg",
};

/**
 * Devuelve el par de className `bg + text` para un tono categórico.
 * Útil para IconTile y contenedores tonales pequeños.
 *
 * Ejemplo:
 *   const cls = toneClasses("emerald");
 *   // → "bg-tint-emerald text-tint-emerald-fg"
 */
export function toneClasses(tone: Tone): string {
  return `${TONE_BG[tone]} ${TONE_FG[tone]}`;
}

/** Devuelve solo el className de background tonal. */
export function toneBg(tone: Tone): string {
  return TONE_BG[tone];
}

/** Devuelve solo el className del foreground (texto/ícono) tonal. */
export function toneFg(tone: Tone): string {
  return TONE_FG[tone];
}

// ───────────────────────────────────────────────────────────────────
// Icon sizes — estandarizados. NO usar valores arbitrarios.
// (Re-exportado desde opai-ds para single source of truth.)
// ───────────────────────────────────────────────────────────────────
export const ICON_SIZE = {
  xs: 14,
  sm: 16,
  md: 18,
  lg: 20,
  xl: 24,
  "2xl": 32,
} as const;
export type IconSize = keyof typeof ICON_SIZE;

// ───────────────────────────────────────────────────────────────────
// Type scale — tamaños tipográficos canónicos del DS.
// Toda escritura nueva debe usar uno de estos via Tailwind class.
// ───────────────────────────────────────────────────────────────────
export const TYPE_SCALE = {
  xs: { px: 12, lh: 16, className: "text-xs" }, // captions, metadata
  sm: { px: 14, lh: 20, className: "text-sm" }, // body en tablas/forms
  base: { px: 16, lh: 24, className: "text-base" }, // body mobile
  lg: { px: 18, lh: 28, className: "text-lg" }, // título de card
  xl: { px: 20, lh: 28, className: "text-xl" }, // título de sección
  "2xl": { px: 24, lh: 32, className: "text-2xl" }, // título de página
  "3xl": { px: 30, lh: 36, className: "text-3xl" }, // dashboards / empty states
} as const;
export type TypeScaleKey = keyof typeof TYPE_SCALE;

// ───────────────────────────────────────────────────────────────────
// Helpers utilitarios
// ───────────────────────────────────────────────────────────────────

/** Mapea un score 0-100 a un kind semántico. */
export function thresholdFromScore(
  score: number | null | undefined,
): StatusKind | "neutral" {
  if (score == null) return "neutral";
  if (score >= 80) return "ok";
  if (score >= 60) return "warn";
  return "danger";
}

/**
 * Asigna un tono categórico determinístico a partir de un string.
 * Útil para colorear automáticamente una lista de categorías sin
 * hardcoded mapping. Estable: el mismo input siempre da el mismo tono.
 */
export function toneFromString(input: string): Tone {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % TONES.length;
  return TONES[index];
}
