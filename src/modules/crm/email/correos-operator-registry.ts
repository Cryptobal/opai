/**
 * Fuente única de operadores de búsqueda de correos.
 * Consumida por: parser (`correos-search.ts`), chips de UI y tests.
 */
import {
  CORREO_LIST_FILTERS,
  CORREO_SEARCH_VERTICALS,
} from "./correos-search-constants";

export type CorreoOperatorType =
  | "address"
  | "domain"
  | "text"
  | "enum"
  | "duration"
  | "date";

export type CorreoOperatorDef = {
  key: string;
  /** Alias aceptados por el parser (además de `key`). */
  aliases?: readonly string[];
  label: string;
  type: CorreoOperatorType;
  values?: readonly string[];
  /** Si true, aparece en chips del overlay de búsqueda. */
  chip?: boolean;
  /** Token sugerido al hacer click (puede incluir valor default). */
  chipToken?: string;
  hint?: string;
};

export const CORREO_OPERATOR_REGISTRY: readonly CorreoOperatorDef[] = [
  { key: "from", label: "De", type: "address", chip: true, chipToken: "from:", hint: "remitente" },
  { key: "to", label: "Para", type: "address", chip: true, chipToken: "to:", hint: "destinatario" },
  { key: "cc", label: "CC", type: "address", chip: true, chipToken: "cc:", hint: "con copia" },
  {
    key: "domain",
    label: "Dominio",
    type: "domain",
    chip: true,
    chipToken: "domain:",
    hint: "dominio",
  },
  {
    key: "subject",
    label: "Asunto",
    type: "text",
    chip: true,
    chipToken: "subject:",
    hint: "asunto",
  },
  {
    key: "has",
    label: "Contiene",
    type: "enum",
    values: ["attachment", "adjunto", "adjuntos"],
    chip: true,
    chipToken: "has:attachment",
    hint: "con adjuntos",
  },
  {
    key: "is",
    label: "Estado",
    type: "enum",
    values: ["unread", "read", "starred"],
    chip: true,
    chipToken: "is:unread",
    hint: "no leídos",
  },
  {
    key: "in",
    label: "Carpeta",
    type: "enum",
    values: CORREO_LIST_FILTERS,
    chip: true,
    chipToken: "in:all",
    hint: "carpeta",
  },
  {
    key: "vertical",
    label: "Vertical",
    type: "enum",
    aliases: ["label"],
    values: CORREO_SEARCH_VERTICALS,
    chip: true,
    chipToken: "vertical:",
    hint: "vertical",
  },
  {
    key: "newer_than",
    label: "Más nuevo que",
    type: "duration",
    chip: true,
    chipToken: "newer_than:7d",
    hint: "últimos 7 días",
  },
  {
    key: "older_than",
    label: "Más viejo que",
    type: "duration",
    chip: true,
    chipToken: "older_than:30d",
    hint: "más de 30 días",
  },
  {
    key: "before",
    label: "Antes de",
    type: "date",
    chip: true,
    chipToken: "before:",
    hint: "antes de AAAA-MM-DD",
  },
  {
    key: "after",
    label: "Después de",
    type: "date",
    chip: true,
    chipToken: "after:",
    hint: "desde AAAA-MM-DD",
  },
] as const;

/** Chips del overlay: `{ token, hint }` para ModuleSearch. */
export function correoSearchOperatorChips(): Array<{ token: string; hint: string }> {
  return CORREO_OPERATOR_REGISTRY.filter((op) => op.chip).map((op) => ({
    token: op.chipToken ?? `${op.key}:`,
    hint: op.hint ?? op.label,
  }));
}

/** Regex de operador construida desde el registry (incluye aliases). */
export function correoOperatorRegex(): RegExp {
  const keys = CORREO_OPERATOR_REGISTRY.flatMap((op) => [op.key, ...(op.aliases ?? [])]);
  const unique = Array.from(new Set(keys));
  return new RegExp(`^(${unique.join("|")}):(.*)$`, "i");
}
