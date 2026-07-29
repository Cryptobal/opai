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

export type HourHeightPreset = 44 | 60 | 84;
export type StepMinutes = 5 | 15 | 30;
export type FirstDay = 0 | 1;

export type AgendaDesktopPrefs = {
  view: AgendaViewMode;
  railCollapsed: boolean;
  hiddenSources: AgendaSourceKey[];
  startHour: number;
  endHour: number;
  fitToWindow: boolean;
  hourHeight: HourHeightPreset;
  stepMinutes: StepMinutes;
  halfHourLine: boolean;
  nowLine: boolean;
  firstDay: FirstDay;
  showWeekends: boolean;
  showTasks: boolean;
  showOwner: boolean;
};

/** Subconjunto de prefs que consume la grilla. */
export type AgendaGridPrefs = Pick<
  AgendaDesktopPrefs,
  | "startHour"
  | "endHour"
  | "fitToWindow"
  | "hourHeight"
  | "stepMinutes"
  | "halfHourLine"
  | "nowLine"
  | "firstDay"
  | "showWeekends"
  | "showTasks"
  | "showOwner"
>;

const VALID_VIEWS: AgendaViewMode[] = ["day", "multi", "week", "month"];
const VALID_HOUR_HEIGHTS: HourHeightPreset[] = [44, 60, 84];
const VALID_STEPS: StepMinutes[] = [5, 15, 30];

export const DEFAULT_AGENDA_PREFS: AgendaDesktopPrefs = {
  view: "week",
  railCollapsed: false,
  hiddenSources: [],
  startHour: 7,
  endHour: 21,
  fitToWindow: true,
  hourHeight: 60,
  stepMinutes: 15,
  halfHourLine: true,
  nowLine: true,
  firstDay: 1,
  showWeekends: true,
  showTasks: true,
  showOwner: true,
};

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function readHours(
  parsed: Partial<AgendaDesktopPrefs>,
): Pick<AgendaDesktopPrefs, "startHour" | "endHour"> {
  let startHour = clampInt(parsed.startHour, 0, 23, DEFAULT_AGENDA_PREFS.startHour);
  let endHour = clampInt(parsed.endHour, 1, 24, DEFAULT_AGENDA_PREFS.endHour);
  if (endHour <= startHour) {
    startHour = DEFAULT_AGENDA_PREFS.startHour;
    endHour = DEFAULT_AGENDA_PREFS.endHour;
  }
  return { startHour, endHour };
}

export function readDesktopPrefs(): AgendaDesktopPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_AGENDA_PREFS };
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_AGENDA_PREFS };
    const parsed = JSON.parse(raw) as Partial<AgendaDesktopPrefs>;
    const hours = readHours(parsed);
    const hourHeight = VALID_HOUR_HEIGHTS.includes(parsed.hourHeight as HourHeightPreset)
      ? (parsed.hourHeight as HourHeightPreset)
      : DEFAULT_AGENDA_PREFS.hourHeight;
    const stepMinutes = VALID_STEPS.includes(parsed.stepMinutes as StepMinutes)
      ? (parsed.stepMinutes as StepMinutes)
      : DEFAULT_AGENDA_PREFS.stepMinutes;
    const firstDay: FirstDay = parsed.firstDay === 0 ? 0 : 1;
    const hiddenSources = Array.isArray(parsed.hiddenSources)
      ? parsed.hiddenSources.filter((s): s is AgendaSourceKey =>
          (AGENDA_SOURCE_KEYS as readonly string[]).includes(s),
        )
      : [];

    // showTasks ↔ toggle "tareas" del rail: una sola verdad.
    let showTasks = parsed.showTasks !== false;
    if (parsed.showTasks === undefined && hiddenSources.includes("tareas")) {
      showTasks = false;
    }
    const nextHidden: AgendaSourceKey[] = showTasks
      ? hiddenSources.filter((s) => s !== "tareas")
      : hiddenSources.includes("tareas")
        ? hiddenSources
        : [...hiddenSources, "tareas" as const];

    return {
      view: parsed.view && VALID_VIEWS.includes(parsed.view) ? parsed.view : DEFAULT_AGENDA_PREFS.view,
      railCollapsed: parsed.railCollapsed === true,
      hiddenSources: nextHidden,
      ...hours,
      fitToWindow: parsed.fitToWindow !== false,
      hourHeight,
      stepMinutes,
      halfHourLine: parsed.halfHourLine !== false,
      nowLine: parsed.nowLine !== false,
      firstDay,
      showWeekends: parsed.showWeekends !== false,
      showTasks,
      showOwner: parsed.showOwner !== false,
    };
  } catch {
    return { ...DEFAULT_AGENDA_PREFS };
  }
}

export function writeDesktopPrefs(prefs: AgendaDesktopPrefs): void {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // storage lleno/bloqueado: prefs efímeras
  }
}

export function toGridPrefs(prefs: AgendaDesktopPrefs): AgendaGridPrefs {
  return {
    startHour: prefs.startHour,
    endHour: prefs.endHour,
    fitToWindow: prefs.fitToWindow,
    hourHeight: prefs.hourHeight,
    stepMinutes: prefs.stepMinutes,
    halfHourLine: prefs.halfHourLine,
    nowLine: prefs.nowLine,
    firstDay: prefs.firstDay,
    showWeekends: prefs.showWeekends,
    showTasks: prefs.showTasks,
    showOwner: prefs.showOwner,
  };
}
