// Nota: este archivo solo exporta tipos y catálogos (TABS/CHIPS)
// compartidos por CorreosDesktopRail y CorreosMobileDrawer. El componente
// <CorreosFilters> (toolbar unificada pre-rediseño Gmail) fue retirado.

export type CorreoFolderTab =
  | "inbox"
  | "archived"
  | "all"
  | "trash"
  | "snoozed"
  | "sent"
  | "drafts"
  | "spam"
  | "starred"
  | "scheduled";

/** Eje excluyente de asociación CRM (popover Filtros). */
export type CorreoAssocKey = "todos" | "con_cuenta" | "sin_asociar";

/** Predicados independientes (pueden combinarse). */
export type CorreoFilterFlag = "sin_responder" | "con_adjuntos";

/**
 * Clave legada (single-select) — se mantiene para el drawer móvil mientras
 * exista el shim `chipFromFilters` / `filtersFromChip`.
 */
export type CorreoChipKey =
  | CorreoAssocKey
  | CorreoFilterFlag
  | "leads_creados";

export const ASSOC_OPTIONS: { key: CorreoAssocKey; label: string }[] = [
  { key: "todos", label: "Todas" },
  { key: "con_cuenta", label: "Con cuenta" },
  { key: "sin_asociar", label: "Sin asociar" },
];

export const FILTER_FLAG_OPTIONS: {
  key: CorreoFilterFlag;
  label: string;
  description: string;
}[] = [
  {
    key: "sin_responder",
    label: "Sin responder",
    description: "El último mensaje espera tu respuesta",
  },
  {
    key: "con_adjuntos",
    label: "Con adjuntos",
    description: "Hilos que incluyen archivos",
  },
];

// Espejo de Gmail: no hay bandeja "Archivados" — los archivados viven dentro
// de "Todos". El tipo `archived` se mantiene solo por compat de deep-links.
export const TABS: { key: CorreoFolderTab; label: string }[] = [
  { key: "inbox", label: "Bandeja de entrada" },
  { key: "snoozed", label: "Pospuestos" },
  { key: "sent", label: "Enviados" },
  { key: "drafts", label: "Borradores" },
  { key: "scheduled", label: "Programados" },
  { key: "starred", label: "Destacados" },
  { key: "all", label: "Todos" },
  { key: "spam", label: "Spam" },
  { key: "trash", label: "Papelera" },
];

/** Catálogo legado completo (drawer móvil / migración). */
export const CHIPS: { key: CorreoChipKey; label: string }[] = [
  { key: "todos", label: "Todas las asociaciones" },
  { key: "con_cuenta", label: "Con cuenta" },
  { key: "sin_asociar", label: "Sin asociar" },
  { key: "sin_responder", label: "Sin responder" },
  { key: "con_adjuntos", label: "Con adjuntos" },
  { key: "leads_creados", label: "Leads creados" },
];

/** @deprecated Usar ASSOC_OPTIONS + FILTER_FLAG_OPTIONS. */
export const TOP_ASSOC_CHIPS = CHIPS.filter(
  (c) => c.key !== "todos" && c.key !== "leads_creados",
);

export type CorreoFolderCounts = {
  inbox: number;
  inboxUnread?: number;
  archived: number;
  all: number;
  trash: number;
  snoozed: number;
  drafts?: number;
  spam?: number;
  scheduled?: number;
} | null;

export function emptyFilterFlags(): Set<CorreoFilterFlag> {
  return new Set();
}

export function countActiveFilters(
  assoc: CorreoAssocKey,
  flags: ReadonlySet<CorreoFilterFlag>,
): number {
  return (assoc === "todos" ? 0 : 1) + flags.size;
}

/** Shim: deriva un CorreoChipKey legado cuando hay un solo eje activo. */
export function chipFromFilters(
  assoc: CorreoAssocKey,
  flags: ReadonlySet<CorreoFilterFlag>,
): CorreoChipKey {
  if (flags.size === 1 && assoc === "todos") {
    return [...flags][0]!;
  }
  if (flags.size === 0) return assoc;
  // Multi-flag: el chip legado no puede representarlo; preferir asociación.
  return assoc;
}

/** Migración defensiva desde el single-select legado. */
export function filtersFromChip(chip: CorreoChipKey): {
  assoc: CorreoAssocKey;
  flags: Set<CorreoFilterFlag>;
} {
  if (chip === "con_cuenta" || chip === "sin_asociar" || chip === "todos") {
    return { assoc: chip, flags: emptyFilterFlags() };
  }
  if (chip === "sin_responder" || chip === "con_adjuntos") {
    return { assoc: "todos", flags: new Set([chip]) };
  }
  // leads_creados u otros desconocidos → default
  return { assoc: "todos", flags: emptyFilterFlags() };
}

export function matchesCorreoFilters(
  t: {
    accountId?: string | null;
    slaLevel?: string | null;
    attachmentCount: number;
    leadId?: string | null;
  },
  assoc: CorreoAssocKey,
  flags: ReadonlySet<CorreoFilterFlag>,
  /** Solo vía chip legado del drawer. */
  legacyLeads = false,
): boolean {
  if (legacyLeads) return Boolean(t.leadId);
  if (assoc === "con_cuenta" && !t.accountId) return false;
  if (assoc === "sin_asociar" && t.accountId) return false;
  if (flags.has("sin_responder") && t.slaLevel !== "warn" && t.slaLevel !== "danger") {
    return false;
  }
  if (flags.has("con_adjuntos") && t.attachmentCount <= 0) return false;
  return true;
}
