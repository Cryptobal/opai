/**
 * DS v4 — identidad cromática determinista por entidad.
 *
 * Misma entrada → mismo tint en servidor y cliente (sin Math.random).
 * Las clases Tailwind se devuelven literales completas (sin interpolación)
 * para que el scanner de Tailwind las detecte.
 */

export const ENTITY_TINTS = [
  "emerald",
  "violet",
  "amber",
  "sky",
  "rose",
  "teal",
] as const;

export type EntityTint = (typeof ENTITY_TINTS)[number];

/** Override manual para clientes frecuentes (id → tint fijo). */
export type EntityTintOverrides = Record<string, EntityTint>;

const TINT_CLASS_MAP: Record<
  EntityTint,
  { bg: string; fg: string; rail: string }
> = {
  emerald: {
    bg: "bg-tint-emerald",
    fg: "text-tint-emerald-fg",
    rail: "shadow-[inset_3px_0_0_0_hsl(var(--tint-emerald-fg))]",
  },
  violet: {
    bg: "bg-tint-violet",
    fg: "text-tint-violet-fg",
    rail: "shadow-[inset_3px_0_0_0_hsl(var(--tint-violet-fg))]",
  },
  amber: {
    bg: "bg-tint-amber",
    fg: "text-tint-amber-fg",
    rail: "shadow-[inset_3px_0_0_0_hsl(var(--tint-amber-fg))]",
  },
  sky: {
    bg: "bg-tint-sky",
    fg: "text-tint-sky-fg",
    rail: "shadow-[inset_3px_0_0_0_hsl(var(--tint-sky-fg))]",
  },
  rose: {
    bg: "bg-tint-rose",
    fg: "text-tint-rose-fg",
    rail: "shadow-[inset_3px_0_0_0_hsl(var(--tint-rose-fg))]",
  },
  teal: {
    bg: "bg-tint-teal",
    fg: "text-tint-teal-fg",
    rail: "shadow-[inset_3px_0_0_0_hsl(var(--tint-teal-fg))]",
  },
};

const FALLBACK_TINT: EntityTint = "teal";

/** djb2 — determinista, estable SSR/cliente. */
function hashDjb2(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
    hash |= 0; // force 32-bit signed
  }
  // Unsigned for modulo
  return hash >>> 0;
}

export function tintFromId(
  id: string | null | undefined,
  overrides?: EntityTintOverrides,
): EntityTint {
  if (!id) return FALLBACK_TINT;
  if (overrides && overrides[id]) return overrides[id];
  const idx = hashDjb2(id) % ENTITY_TINTS.length;
  return ENTITY_TINTS[idx]!;
}

export function tintClasses(tint: EntityTint): {
  bg: string;
  fg: string;
  rail: string;
} {
  return TINT_CLASS_MAP[tint] ?? TINT_CLASS_MAP[FALLBACK_TINT];
}
