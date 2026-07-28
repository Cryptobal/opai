// Nota: este archivo solo exporta tipos y catálogos (TABS/CHIPS/VERTICAL_LABELS)
// compartidos por CorreosDesktopRail y CorreosMobileDrawer. El componente
// <CorreosFilters> (toolbar unificada pre-rediseño Gmail) fue retirado: ya no
// se renderiza en ningún lado — CorreosDesktopToolbar/CorreosMobileTopBar lo
// reemplazaron — y mantenerlo vivo sin uso arriesgaba drift (p. ej. el input
// de búsqueda de acá no tenía botón de limpiar y alguien podía editarlo
// pensando que era la UI activa).

import { VERTICAL_META } from "@/modules/crm/email/radar-types";

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
export type CorreoChipKey = "todos" | "con_cuenta" | "sin_asociar" | "con_adjuntos" | "leads_creados";

// Espejo de Gmail: no hay bandeja "Archivados" — los archivados viven dentro
// de "Todos". El tipo `archived` se mantiene solo por compat de deep-links.
// "Programados" (PR-12) se alimenta del outbox, no de hilos.
// Export: el top y el drawer móviles reusan el mismo catálogo de carpetas.
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

// Export: el drawer móvil reusa el mismo catálogo de asociaciones.
export const CHIPS: { key: CorreoChipKey; label: string }[] = [
  { key: "todos", label: "Todas las asociaciones" },
  { key: "con_cuenta", label: "Con cuenta" },
  { key: "sin_asociar", label: "Sin asociar" },
  { key: "con_adjuntos", label: "Con adjuntos" },
  { key: "leads_creados", label: "Leads creados" },
];

// A03: verticales de la clasificación v5 (filtro server-side).
// Derivado de VERTICAL_META (fuente única de label + color).
export const VERTICAL_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(VERTICAL_META)
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([key, meta]) => [key, meta.label]),
);

// Export: mismos contadores que consume el drawer móvil.
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

