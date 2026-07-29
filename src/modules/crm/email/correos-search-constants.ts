import type { CorreoListFilter } from "./correos-list";

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

export const CORREO_LIST_FILTERS: readonly CorreoListFilter[] = [
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
