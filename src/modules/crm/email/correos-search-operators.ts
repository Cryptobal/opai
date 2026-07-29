/**
 * Fuente única de operadores de búsqueda de correos (parser, chips UI, tools).
 * Cualquier operador nuevo se declara aquí y se cablea en el parser.
 */

export const CORREO_SEARCH_VERTICALS = [
  "operaciones",
  "rrhh",
  "comercial",
  "finanzas",
  "cobranza",
  "contratos",
  "incidentes",
  "otro",
] as const;

export const CORREO_LIST_FILTERS = [
  "inbox",
  "sent",
  "drafts",
  "starred",
  "spam",
  "trash",
  "all",
  "snoozed",
  "archived",
] as const;

export type CorreoOperatorType =
  | "address"
  | "domain"
  | "text"
  | "enum"
  | "duration"
  | "date";

export type CorreoOperatorDef = {
  key: string;
  /** Aliases que el parser acepta (p. ej. label → vertical). */
  aliases?: readonly string[];
  label: string;
  type: CorreoOperatorType;
  values?: readonly string[];
  /** Texto corto para el chip de ayuda. */
  hint: string;
  /** Si true, el chip inserta `key:valor` completo (no solo el prefijo). */
  chipToken?: string;
  /** Mostrar en el overlay de chips de la bandeja. */
  showInChips?: boolean;
};

export const CORREO_OPERATOR_REGISTRY: readonly CorreoOperatorDef[] = [
  { key: "from", label: "De", type: "address", hint: "remitente", showInChips: true },
  { key: "to", label: "Para", type: "address", hint: "destinatario", showInChips: true },
  { key: "cc", label: "CC", type: "address", hint: "en copia", showInChips: false },
  {
    key: "domain",
    label: "Dominio",
    type: "domain",
    hint: "dominio",
    showInChips: true,
  },
  {
    key: "subject",
    label: "Asunto",
    type: "text",
    hint: "asunto",
    showInChips: true,
  },
  {
    key: "has",
    label: "Contiene",
    type: "enum",
    values: ["attachment", "adjunto", "adjuntos"],
    hint: "con adjuntos",
    chipToken: "has:attachment",
    showInChips: true,
  },
  {
    key: "is",
    label: "Estado",
    type: "enum",
    values: ["unread", "read", "starred"],
    hint: "no leídos",
    chipToken: "is:unread",
    showInChips: true,
  },
  {
    key: "in",
    label: "Carpeta",
    type: "enum",
    values: CORREO_LIST_FILTERS,
    hint: "carpeta",
    chipToken: "in:all",
    showInChips: true,
  },
  {
    key: "vertical",
    label: "Vertical",
    type: "enum",
    aliases: ["label"],
    values: CORREO_SEARCH_VERTICALS,
    hint: "vertical",
    showInChips: true,
  },
  {
    key: "newer_than",
    label: "Más nuevo que",
    type: "duration",
    hint: "últimos 7 días",
    chipToken: "newer_than:7d",
    showInChips: true,
  },
  {
    key: "older_than",
    label: "Más viejo que",
    type: "duration",
    hint: "más de 30 días",
    chipToken: "older_than:30d",
    showInChips: true,
  },
  {
    key: "before",
    label: "Antes de",
    type: "date",
    hint: "antes de AAAA-MM-DD",
    showInChips: true,
  },
  {
    key: "after",
    label: "Después de",
    type: "date",
    hint: "desde AAAA-MM-DD",
    showInChips: true,
  },
] as const;

/** Chips accionables del overlay de búsqueda. */
export function getCorreoSearchOperatorChips(): Array<{ token: string; hint: string }> {
  return CORREO_OPERATOR_REGISTRY.filter((op) => op.showInChips).map((op) => ({
    token: op.chipToken ?? `${op.key}:`,
    hint: op.hint,
  }));
}

/** Claves (+ aliases) que el parser reconoce. */
export function getCorreoOperatorKeys(): Set<string> {
  const keys = new Set<string>();
  for (const op of CORREO_OPERATOR_REGISTRY) {
    keys.add(op.key);
    for (const a of op.aliases ?? []) keys.add(a);
  }
  return keys;
}
