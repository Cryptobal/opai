import type { AgendaCalendarItem, AgendaViewMode } from "../agenda-calendar.types";

/**
 * Preferencias desktop de la Agenda (clave compartida histórica; el móvil usa
 * `opai-agenda-prefs-mobile`). `multiDays` legacy se ignora: "3 días" es fijo.
 */
const PREFS_KEY = "opai-agenda-prefs";

/** Fuentes/"calendarios OPAI" del rail (toggle on/off + color). */
export const AGENDA_SOURCE_KEYS = [
  "cliente",
  "tecnica",
  "tareas",
  "licitaciones",
  "google",
] as const;
export type AgendaSourceKey = (typeof AGENDA_SOURCE_KEYS)[number];

/** Fuente lógica de un item para los toggles del rail. */
export function agendaSourceKey(
  item: Pick<AgendaCalendarItem, "source" | "type">,
): AgendaSourceKey {
  if (item.source === "tarea") return "tareas";
  if (item.source === "google") return "google";
  if (item.source === "licitacion" || item.type === "licitacion") return "licitaciones";
  if (item.type === "tecnica") return "tecnica";
  return "cliente";
}

export type AgendaDesktopPrefs = {
  view: AgendaViewMode;
  railCollapsed: boolean;
  hiddenSources: AgendaSourceKey[];
};

const VALID_VIEWS: AgendaViewMode[] = ["day", "multi", "week", "month"];

export function readDesktopPrefs(): AgendaDesktopPrefs {
  const fallback: AgendaDesktopPrefs = {
    view: "week",
    railCollapsed: false,
    hiddenSources: [],
  };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<AgendaDesktopPrefs>;
    return {
      view: parsed.view && VALID_VIEWS.includes(parsed.view) ? parsed.view : fallback.view,
      railCollapsed: parsed.railCollapsed === true,
      hiddenSources: Array.isArray(parsed.hiddenSources)
        ? parsed.hiddenSources.filter((s): s is AgendaSourceKey =>
            (AGENDA_SOURCE_KEYS as readonly string[]).includes(s),
          )
        : [],
    };
  } catch {
    return fallback;
  }
}

export function writeDesktopPrefs(prefs: AgendaDesktopPrefs): void {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // storage lleno/bloqueado: prefs efímeras
  }
}
