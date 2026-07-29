/**
 * Paleta cerrada de 12 tints del DS para calendario (y correo).
 * `color` en BD guarda la clave (`"teal"`), nunca un hex.
 */

export const CALENDAR_PALETTE_KEYS = [
  "teal",
  "violet",
  "rose",
  "amber",
  "emerald",
  "sky",
  "indigo",
  "cyan",
  "lime",
  "orange",
  "fuchsia",
  "slate",
] as const;

export type CalendarPaletteKey = (typeof CALENDAR_PALETTE_KEYS)[number];

/** Orden canónico de la paleta (rail, popover, asignación). */
export const CALENDAR_PALETTE_ORDER: readonly CalendarPaletteKey[] = CALENDAR_PALETTE_KEYS;

const KEY_SET = new Set<string>(CALENDAR_PALETTE_KEYS);

export function isValidPaletteKey(value: unknown): value is CalendarPaletteKey {
  return typeof value === "string" && KEY_SET.has(value);
}

/** Token CSS variable name sin `--` (ej. `tint-teal-fg`). */
export function paletteToken(
  key: CalendarPaletteKey,
  variant: "base" | "fg" = "fg",
): string {
  return variant === "fg" ? `tint-${key}-fg` : `tint-${key}`;
}

/** Clases Tailwind para swatch suave (fondo + texto). */
export const PALETTE_SOFT: Record<CalendarPaletteKey, string> = {
  teal: "bg-tint-teal text-tint-teal-fg",
  violet: "bg-tint-violet text-tint-violet-fg",
  rose: "bg-tint-rose text-tint-rose-fg",
  amber: "bg-tint-amber text-tint-amber-fg",
  emerald: "bg-tint-emerald text-tint-emerald-fg",
  sky: "bg-tint-sky text-tint-sky-fg",
  indigo: "bg-tint-indigo text-tint-indigo-fg",
  cyan: "bg-tint-cyan text-tint-cyan-fg",
  lime: "bg-tint-lime text-tint-lime-fg",
  orange: "bg-tint-orange text-tint-orange-fg",
  fuchsia: "bg-tint-fuchsia text-tint-fuchsia-fg",
  slate: "bg-tint-slate text-tint-slate-fg",
};

/** Clases Tailwind para barra / borde sólido del fg. */
export const PALETTE_FG_BG: Record<CalendarPaletteKey, string> = {
  teal: "bg-tint-teal-fg",
  violet: "bg-tint-violet-fg",
  rose: "bg-tint-rose-fg",
  amber: "bg-tint-amber-fg",
  emerald: "bg-tint-emerald-fg",
  sky: "bg-tint-sky-fg",
  indigo: "bg-tint-indigo-fg",
  cyan: "bg-tint-cyan-fg",
  lime: "bg-tint-lime-fg",
  orange: "bg-tint-orange-fg",
  fuchsia: "bg-tint-fuchsia-fg",
  slate: "bg-tint-slate-fg",
};

export const PALETTE_FG_TEXT: Record<CalendarPaletteKey, string> = {
  teal: "text-tint-teal-fg",
  violet: "text-tint-violet-fg",
  rose: "text-tint-rose-fg",
  amber: "text-tint-amber-fg",
  emerald: "text-tint-emerald-fg",
  sky: "text-tint-sky-fg",
  indigo: "text-tint-indigo-fg",
  cyan: "text-tint-cyan-fg",
  lime: "text-tint-lime-fg",
  orange: "text-tint-orange-fg",
  fuchsia: "text-tint-fuchsia-fg",
  slate: "text-tint-slate-fg",
};

export const PALETTE_BORDER: Record<CalendarPaletteKey, string> = {
  teal: "border-tint-teal-fg",
  violet: "border-tint-violet-fg",
  rose: "border-tint-rose-fg",
  amber: "border-tint-amber-fg",
  emerald: "border-tint-emerald-fg",
  sky: "border-tint-sky-fg",
  indigo: "border-tint-indigo-fg",
  cyan: "border-tint-cyan-fg",
  lime: "border-tint-lime-fg",
  orange: "border-tint-orange-fg",
  fuchsia: "border-tint-fuchsia-fg",
  slate: "border-tint-slate-fg",
};

export const PALETTE_SOFT_BG: Record<CalendarPaletteKey, string> = {
  teal: "bg-tint-teal",
  violet: "bg-tint-violet",
  rose: "bg-tint-rose",
  amber: "bg-tint-amber",
  emerald: "bg-tint-emerald",
  sky: "bg-tint-sky",
  indigo: "bg-tint-indigo",
  cyan: "bg-tint-cyan",
  lime: "bg-tint-lime",
  orange: "bg-tint-orange",
  fuchsia: "bg-tint-fuchsia",
  slate: "bg-tint-slate",
};

export function paletteSoft(key: string | null | undefined): string {
  if (key && isValidPaletteKey(key)) return PALETTE_SOFT[key];
  return PALETTE_SOFT.teal;
}

export function paletteFgBg(key: string | null | undefined): string {
  if (key && isValidPaletteKey(key)) return PALETTE_FG_BG[key];
  return PALETTE_FG_BG.teal;
}

export function paletteFgText(key: string | null | undefined): string {
  if (key && isValidPaletteKey(key)) return PALETTE_FG_TEXT[key];
  return PALETTE_FG_TEXT.teal;
}

export function paletteBorder(key: string | null | undefined): string {
  if (key && isValidPaletteKey(key)) return PALETTE_BORDER[key];
  return PALETTE_BORDER.teal;
}

export function paletteSoftBg(key: string | null | undefined): string {
  if (key && isValidPaletteKey(key)) return PALETTE_SOFT_BG[key];
  return PALETTE_SOFT_BG.teal;
}

/** Defaults de origen OPAI cuando no hay preferencia. */
export const OPAI_SOURCE_DEFAULT_COLORS: Record<
  "cliente" | "tecnica" | "tareas" | "licitaciones",
  CalendarPaletteKey
> = {
  cliente: "violet",
  tecnica: "emerald",
  tareas: "teal",
  licitaciones: "amber",
};

/** Asigna el siguiente color libre de la paleta (cíclico). */
export function nextPaletteColor(used: Iterable<string | null | undefined>): CalendarPaletteKey {
  const taken = new Set(
    [...used].filter((c): c is string => Boolean(c) && isValidPaletteKey(c)),
  );
  return (
    CALENDAR_PALETTE_ORDER.find((k) => !taken.has(k)) ??
    CALENDAR_PALETTE_ORDER[[...taken].length % CALENDAR_PALETTE_ORDER.length]
  );
}
