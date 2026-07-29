/**
 * Identidad visual de casillas Gmail (correo multicuenta v1).
 *
 * `color` almacena la clave del tint DS (`teal`, `violet`, …), nunca un hex.
 * Paleta completa de 12 tints (Brief B — calendar-palette).
 */

export const MAILBOX_COLOR_KEYS = [
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

export type MailboxColorKey = (typeof MAILBOX_COLOR_KEYS)[number];

/** Los 12 tints del DS (ver `src/lib/design/calendar-palette.ts`). */
export const MAILBOX_PALETTE: ReadonlyArray<{
  key: MailboxColorKey;
  disponible: boolean;
}> = [
  { key: "teal", disponible: true },
  { key: "violet", disponible: true },
  { key: "rose", disponible: true },
  { key: "amber", disponible: true },
  { key: "emerald", disponible: true },
  { key: "sky", disponible: true },
  { key: "indigo", disponible: true },
  { key: "cyan", disponible: true },
  { key: "lime", disponible: true },
  { key: "orange", disponible: true },
  { key: "fuchsia", disponible: true },
  { key: "slate", disponible: true },
];

export const AVAILABLE_MAILBOX_COLORS = MAILBOX_PALETTE.filter((c) => c.disponible).map(
  (c) => c.key,
);

export const MAX_MAILBOXES_PER_USER = 5;
export const MAX_DISPLAY_LABEL_LENGTH = 6;

/** Tope efectivo: 5 con multicuenta, 1 en modo casilla única. */
export function mailboxCapFor(flagEnabled: boolean): number {
  return flagEnabled ? MAX_MAILBOXES_PER_USER : 1;
}

export function isMailboxColorKey(value: unknown): value is MailboxColorKey {
  return typeof value === "string" && (MAILBOX_COLOR_KEYS as readonly string[]).includes(value);
}

export function isAvailableMailboxColor(value: unknown): value is MailboxColorKey {
  return (
    typeof value === "string" &&
    (AVAILABLE_MAILBOX_COLORS as readonly string[]).includes(value)
  );
}

/** Dominio → etiqueta corta (≤6). `gard.cl` → `Gard`. */
export function labelFromEmail(email: string): string {
  const domain = (email.split("@")[1] ?? email).toLowerCase();
  const base = domain.split(".")[0] || "Mail";
  const titled = base.charAt(0).toUpperCase() + base.slice(1);
  return titled.slice(0, MAX_DISPLAY_LABEL_LENGTH);
}

/**
 * Desambigua etiquetas que colisionan dentro del mismo usuario
 * (`Gard` / `Gard2`). El sufijo numérico consume caracteres del base.
 */
export function uniquifyDisplayLabel(
  base: string,
  usedLabels: ReadonlySet<string>,
): string {
  const normalized = base.trim().slice(0, MAX_DISPLAY_LABEL_LENGTH) || "Mail";
  if (!usedLabels.has(normalized)) return normalized;

  for (let n = 2; n < 100; n++) {
    const suffix = String(n);
    const head = normalized.slice(
      0,
      Math.max(1, MAX_DISPLAY_LABEL_LENGTH - suffix.length),
    );
    const candidate = `${head}${suffix}`;
    if (!usedLabels.has(candidate)) return candidate;
  }
  return normalized.slice(0, MAX_DISPLAY_LABEL_LENGTH);
}

export type ExistingMailboxIdentity = {
  color: string | null;
  displayLabel: string | null;
  sortIndex: number;
};

/**
 * Asigna color (siguiente disponible no usado) y etiqueta al conectar
 * una casilla nueva. Cicla la paleta si se agotan los colores libres.
 */
export function assignMailboxIdentity(
  existing: ReadonlyArray<ExistingMailboxIdentity>,
  email: string,
): { color: MailboxColorKey; displayLabel: string; sortIndex: number; isDefault: boolean } {
  const usedColors = new Set(
    existing.map((e) => e.color).filter((c): c is string => Boolean(c)),
  );
  const usedLabels = new Set(
    existing
      .map((e) => e.displayLabel)
      .filter((l): l is string => Boolean(l))
      .map((l) => l.trim()),
  );

  let color: MailboxColorKey =
    AVAILABLE_MAILBOX_COLORS.find((c) => !usedColors.has(c)) ??
    AVAILABLE_MAILBOX_COLORS[existing.length % AVAILABLE_MAILBOX_COLORS.length];

  const displayLabel = uniquifyDisplayLabel(labelFromEmail(email), usedLabels);
  const maxSort = existing.reduce((m, e) => Math.max(m, e.sortIndex), -1);
  const sortIndex = maxSort + 1;
  const isDefault = existing.length === 0;

  return { color, displayLabel, sortIndex, isDefault };
}
