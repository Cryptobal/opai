import { fromZonedTime, toZonedTime } from "date-fns-tz";
import {
  addDaysChile,
  CHILE_TZ,
  startOfDayChile,
  ymdInChile,
} from "@/lib/dates-cl";
import type {
  AgendaCalendarItem,
  AgendaSchedule,
  AgendaViewMode,
} from "./agenda-calendar.types";

// Rango completo 0-24 (fix B8 del audit: eventos <07 o >21 eran invisibles).
// La grilla desktop hace auto-scroll inicial según startHour de prefs.
export const CALENDAR_START_HOUR = 0;
export const CALENDAR_END_HOUR = 24;
export const CALENDAR_AUTOSCROLL_HOUR = 7;
export const CALENDAR_SLOT_MINUTES = 15;
export const CALENDAR_HOUR_HEIGHT = 84;
export const CALENDAR_MIN_HOUR_HEIGHT = 34;
export const CALENDAR_DAY_MIN_WIDTH = 120;
export const CALENDAR_GUTTER_WIDTH = 56;

const MINUTES_PER_DAY = 24 * 60;
const MIN_EVENT_MINUTES = 30;
const MAX_EVENT_MINUTES = 12 * 60;

export type CalendarRange = {
  from: Date;
  to: Date;
  days: Date[];
};

export type TimedLayoutItem = {
  item: AgendaCalendarItem;
  startMinute: number;
  endMinute: number;
  column: number;
  columnCount: number;
};

export type VisibleRangeOptions = {
  /** 0 = domingo, 1 = lunes (default). */
  firstDay?: 0 | 1;
  /** Si false, en vista semana/multi se ocultan sáb/dom en el render. */
  showWeekends?: boolean;
};

function zonedLocalDate(date: Date): Date {
  return toZonedTime(date, CHILE_TZ);
}

function fromChileLocalDate(date: Date): Date {
  return fromZonedTime(date, CHILE_TZ);
}

export function startOfWeekChile(date: Date, weekStartsOn: 0 | 1 = 1): Date {
  const local = zonedLocalDate(startOfDayChile(date));
  const offset =
    weekStartsOn === 0
      ? local.getDay()
      : (local.getDay() + 6) % 7;
  local.setDate(local.getDate() - offset);
  local.setHours(0, 0, 0, 0);
  return fromChileLocalDate(local);
}

export function startOfMonthChile(date: Date): Date {
  const local = zonedLocalDate(startOfDayChile(date));
  local.setDate(1);
  local.setHours(0, 0, 0, 0);
  return fromChileLocalDate(local);
}

export function addMonthsChile(date: Date, amount: number): Date {
  const local = zonedLocalDate(startOfMonthChile(date));
  local.setMonth(local.getMonth() + amount);
  local.setDate(1);
  local.setHours(0, 0, 0, 0);
  return fromChileLocalDate(local);
}

export function monthGridDays(anchor: Date, weekStartsOn: 0 | 1 = 1): Date[] {
  const first = startOfMonthChile(anchor);
  const start = startOfWeekChile(first, weekStartsOn);
  return Array.from({ length: 42 }, (_, index) => addDaysChile(start, index));
}

/** Filtra sáb/dom del array de días visibles (el rango API sigue completo). */
export function filterWeekendDays(days: Date[], showWeekends: boolean): Date[] {
  if (showWeekends) return days;
  return days.filter((day) => {
    const dow = zonedLocalDate(day).getDay();
    return dow !== 0 && dow !== 6;
  });
}

export function visibleCalendarRange(
  anchor: Date,
  view: AgendaViewMode,
  multiDays: number,
  options: VisibleRangeOptions = {},
): CalendarRange {
  const firstDay = options.firstDay ?? 1;
  const showWeekends = options.showWeekends !== false;

  if (view === "month") {
    const days = monthGridDays(anchor, firstDay);
    return {
      from: days[0],
      to: addDaysChile(days[days.length - 1], 1),
      days,
    };
  }

  const count = view === "day" ? 1 : view === "week" ? 7 : clamp(multiDays, 2, 6);
  const from = view === "week" ? startOfWeekChile(anchor, firstDay) : startOfDayChile(anchor);
  // API range: período completo. El filtrado de fines de semana es solo de render
  // (`displayCalendarDays`); `showWeekends` no altera from/to.
  void showWeekends;
  const days = Array.from({ length: count }, (_, index) => addDaysChile(from, index));
  return { from, to: addDaysChile(from, count), days };
}

/**
 * Días a renderizar en la grilla. El `range.days` de `visibleCalendarRange`
 * conserva la semana completa para el fetch; este helper aplica showWeekends.
 */
export function displayCalendarDays(
  rangeDays: Date[],
  view: AgendaViewMode,
  showWeekends: boolean,
): Date[] {
  if (view === "month" || view === "day" || showWeekends) return rangeDays;
  return filterWeekendDays(rangeDays, false);
}

export function navigateCalendar(
  anchor: Date,
  view: AgendaViewMode,
  multiDays: number,
  direction: -1 | 1,
): Date {
  if (view === "month") return addMonthsChile(anchor, direction);
  const amount = view === "week" ? 7 : view === "day" ? 1 : clamp(multiDays, 2, 6);
  return addDaysChile(anchor, amount * direction);
}

/**
 * Día (ymd Chile) al que pertenece un item. Los all-day llegan como ymd puro
 * ("YYYY-MM-DD") sin zona: se agrupan por ese string tal cual — pasarlos por
 * `new Date()` los correría un día en servidores UTC (audit B6).
 */
export function agendaItemDayKey(item: Pick<AgendaCalendarItem, "start" | "allDay">): string {
  if (item.allDay && /^\d{4}-\d{2}-\d{2}$/.test(item.start)) {
    return item.start;
  }
  return ymdInChile(new Date(item.start));
}

export function minutesInChile(date: Date): number {
  const local = zonedLocalDate(date);
  return local.getHours() * 60 + local.getMinutes();
}

export function dateAtChileSlot(dateKey: string, minute: number): Date {
  const safeMinute = clamp(Math.round(minute), 0, MINUTES_PER_DAY - 1);
  const hours = Math.floor(safeMinute / 60);
  const minutes = safeMinute % 60;
  const local = new Date(
    Number(dateKey.slice(0, 4)),
    Number(dateKey.slice(5, 7)) - 1,
    Number(dateKey.slice(8, 10)),
    hours,
    minutes,
    0,
    0,
  );
  return fromChileLocalDate(local);
}

export function snapMinutes(minute: number, step = CALENDAR_SLOT_MINUTES): number {
  return Math.round(minute / step) * step;
}

/** Alias canónico del brief (`snapTo`). */
export const snapTo = snapMinutes;

/** Minuto del día a partir del offset vertical dentro de la columna horaria. */
export function minuteFromOffset(
  offsetY: number,
  hourHeight: number,
  step = CALENDAR_SLOT_MINUTES,
): number {
  if (hourHeight <= 0) return 0;
  return snapMinutes((offsetY / hourHeight) * 60, step);
}

export function eventDurationMinutes(item: AgendaCalendarItem): number {
  const start = new Date(item.start).getTime();
  const end = new Date(item.end).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return item.source === "tarea" ? 30 : 60;
  }
  return clamp(Math.round((end - start) / 60_000), MIN_EVENT_MINUTES, MAX_EVENT_MINUTES);
}

export function moveItemToSlot(
  item: AgendaCalendarItem,
  dateKey: string,
  minute: number,
  allDay = false,
  step = CALENDAR_SLOT_MINUTES,
): AgendaSchedule {
  const duration = eventDurationMinutes(item);
  const targetMinute = allDay ? 9 * 60 : snapMinutes(minute, step);
  const start = dateAtChileSlot(dateKey, targetMinute);
  return {
    start,
    end: new Date(start.getTime() + duration * 60_000),
    allDay: item.source === "tarea" ? allDay : false,
  };
}

export function moveItemToDay(
  item: AgendaCalendarItem,
  dateKey: string,
): AgendaSchedule {
  return moveItemToSlot(item, dateKey, minutesInChile(new Date(item.start)), item.allDay);
}

export function resizedSchedule(
  item: AgendaCalendarItem,
  deltaPixels: number,
  hourHeight = CALENDAR_HOUR_HEIGHT,
  step = CALENDAR_SLOT_MINUTES,
): AgendaSchedule {
  const currentDuration = eventDurationMinutes(item);
  const deltaMinutes = (deltaPixels / hourHeight) * 60;
  const duration = clamp(
    snapMinutes(currentDuration + deltaMinutes, step),
    MIN_EVENT_MINUTES,
    MAX_EVENT_MINUTES,
  );
  const start = new Date(item.start);
  return {
    start,
    end: new Date(start.getTime() + duration * 60_000),
    allDay: false,
  };
}

export function calendarSlotMinutes(step = CALENDAR_SLOT_MINUTES): number[] {
  const start = CALENDAR_START_HOUR * 60;
  const end = CALENDAR_END_HOUR * 60;
  const slots: number[] = [];
  for (let minute = start; minute < end; minute += step) {
    slots.push(minute);
  }
  return slots;
}

export function layoutTimedItems(items: AgendaCalendarItem[]): TimedLayoutItem[] {
  const dayStart = CALENDAR_START_HOUR * 60;
  const dayEnd = CALENDAR_END_HOUR * 60;
  const timed = items
    .filter((item) => !item.allDay)
    .map((item) => {
      const rawStart = minutesInChile(new Date(item.start));
      const rawEnd = rawStart + eventDurationMinutes(item);
      return {
        item,
        rawStart,
        rawEnd,
      };
    })
    .filter((entry) => entry.rawEnd > dayStart && entry.rawStart < dayEnd)
    .map(({ item, rawStart, rawEnd }) => ({
      item,
      startMinute: clamp(rawStart, dayStart, dayEnd - MIN_EVENT_MINUTES),
      endMinute: clamp(rawEnd, dayStart + MIN_EVENT_MINUTES, dayEnd),
    }))
    .sort((a, b) => a.startMinute - b.startMinute || b.endMinute - a.endMinute);

  const result: TimedLayoutItem[] = [];
  let group: typeof timed = [];
  let groupEnd = -1;

  const flushGroup = () => {
    if (group.length === 0) return;
    const columnEnds: number[] = [];
    const placed = group.map((entry) => {
      let column = columnEnds.findIndex((endMinute) => endMinute <= entry.startMinute);
      if (column === -1) {
        column = columnEnds.length;
        columnEnds.push(entry.endMinute);
      } else {
        columnEnds[column] = entry.endMinute;
      }
      return { ...entry, column };
    });
    const columnCount = Math.max(1, columnEnds.length);
    result.push(...placed.map((entry) => ({ ...entry, columnCount })));
    group = [];
    groupEnd = -1;
  };

  for (const entry of timed) {
    if (group.length > 0 && entry.startMinute >= groupEnd) flushGroup();
    group.push(entry);
    groupEnd = Math.max(groupEnd, entry.endMinute);
  }
  flushGroup();
  return result;
}

export function formatAgendaTime(date: Date): string {
  return date.toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: CHILE_TZ,
  });
}

export function formatAgendaPeriod(
  anchor: Date,
  view: AgendaViewMode,
  multiDays: number,
  options?: VisibleRangeOptions,
): string {
  const { days: rangeDays } = visibleCalendarRange(anchor, view, multiDays, options);
  const days = displayCalendarDays(rangeDays, view, options?.showWeekends !== false);
  if (view === "month") {
    return anchor.toLocaleDateString("es-CL", {
      month: "long",
      year: "numeric",
      timeZone: CHILE_TZ,
    });
  }
  const first = days[0];
  const last = days[days.length - 1];
  if (ymdInChile(first) === ymdInChile(last)) {
    return first.toLocaleDateString("es-CL", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: CHILE_TZ,
    });
  }
  const firstLabel = first.toLocaleDateString("es-CL", {
    day: "numeric",
    month: "short",
    timeZone: CHILE_TZ,
  });
  const lastLabel = last.toLocaleDateString("es-CL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: CHILE_TZ,
  });
  return `${firstLabel} – ${lastLabel}`;
}

export function isMovableAgendaItem(item: AgendaCalendarItem): boolean {
  return item.source === "agenda_visita" || item.source === "tarea";
}

export function isResizableAgendaItem(item: AgendaCalendarItem): boolean {
  return item.source === "agenda_visita" && !item.allDay;
}

export function itemKey(item: AgendaCalendarItem): string {
  return `${item.source}:${item.id}`;
}

export type AllDaySegment = {
  item: AgendaCalendarItem;
  /** Índice 0-based en `dayKeys` (inclusive). */
  startIndex: number;
  /** Índice 0-based en `dayKeys` (inclusive). */
  endIndex: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
  /** El extremo derecho visible es el día de entrega de la licitación. */
  isEntregaEnd: boolean;
};

export type AllDayLane = {
  segments: AllDaySegment[];
};

type SpanDraft = {
  key: string;
  item: AgendaCalendarItem;
  spanStartYmd: string;
  spanEndYmd: string;
};

function resolveSpanDraft(item: AgendaCalendarItem): SpanDraft {
  const day = agendaItemDayKey(item);
  const key = item.spanKey ?? itemKey(item);
  return {
    key,
    item,
    spanStartYmd: item.spanStartYmd ?? day,
    spanEndYmd: item.spanEndYmd ?? day,
  };
}

function preferSpanItem(current: AgendaCalendarItem, next: AgendaCalendarItem): AgendaCalendarItem {
  const curEntrega = current.title.startsWith("ENTREGA");
  const nextEntrega = next.title.startsWith("ENTREGA");
  if (curEntrega && !nextEntrega) return next;
  if (!curEntrega && nextEntrega) return current;
  return current.start <= next.start ? current : next;
}

/**
 * Agrupa items all-day en carriles con segmentos horizontales multi-día.
 * Orden estable: spanStartYmd, luego title. Solapes → carril siguiente.
 */
export function buildAllDayLanes(
  items: AgendaCalendarItem[],
  dayKeys: string[],
): AllDayLane[] {
  if (dayKeys.length === 0) return [];
  const firstDay = dayKeys[0]!;
  const lastDay = dayKeys[dayKeys.length - 1]!;
  const indexByDay = new Map(dayKeys.map((d, i) => [d, i]));

  const drafts = new Map<string, SpanDraft>();
  for (const item of items) {
    if (!item.allDay) continue;
    const draft = resolveSpanDraft(item);
    const prev = drafts.get(draft.key);
    if (!prev) {
      drafts.set(draft.key, draft);
      continue;
    }
    drafts.set(draft.key, {
      key: draft.key,
      item: preferSpanItem(prev.item, draft.item),
      spanStartYmd:
        prev.spanStartYmd < draft.spanStartYmd ? prev.spanStartYmd : draft.spanStartYmd,
      spanEndYmd: prev.spanEndYmd > draft.spanEndYmd ? prev.spanEndYmd : draft.spanEndYmd,
    });
  }

  const segments: AllDaySegment[] = [];
  for (const draft of drafts.values()) {
    if (draft.spanEndYmd < firstDay || draft.spanStartYmd > lastDay) continue;

    let startIndex = 0;
    let endIndex = dayKeys.length - 1;
    const continuesBefore = draft.spanStartYmd < firstDay;
    const continuesAfter = draft.spanEndYmd > lastDay;

    if (!continuesBefore) {
      const idx = indexByDay.get(draft.spanStartYmd);
      if (idx != null) startIndex = idx;
      else {
        // Día de inicio oculto (p. ej. fin de semana): primer día visible ≥ spanStart.
        startIndex = dayKeys.findIndex((d) => d >= draft.spanStartYmd);
        if (startIndex < 0) continue;
      }
    }
    if (!continuesAfter) {
      const idx = indexByDay.get(draft.spanEndYmd);
      if (idx != null) endIndex = idx;
      else {
        // Día de fin oculto: último día visible ≤ spanEnd.
        for (let i = dayKeys.length - 1; i >= 0; i -= 1) {
          if (dayKeys[i]! <= draft.spanEndYmd) {
            endIndex = i;
            break;
          }
        }
      }
    }
    if (endIndex < startIndex) continue;

    const endDay = dayKeys[endIndex]!;
    segments.push({
      item: draft.item,
      startIndex,
      endIndex,
      continuesBefore,
      continuesAfter,
      isEntregaEnd:
        (draft.item.source === "licitacion" || draft.item.type === "licitacion") &&
        !continuesAfter &&
        endDay === draft.spanEndYmd,
    });
  }

  segments.sort((a, b) => {
    const startCmp = (a.item.spanStartYmd ?? dayKeys[a.startIndex]!).localeCompare(
      b.item.spanStartYmd ?? dayKeys[b.startIndex]!,
    );
    if (startCmp !== 0) return startCmp;
    return a.item.title.localeCompare(b.item.title, "es");
  });

  const lanes: AllDayLane[] = [];
  const laneEnds: number[] = [];
  for (const segment of segments) {
    let laneIdx = laneEnds.findIndex((end) => end < segment.startIndex);
    if (laneIdx < 0) {
      laneIdx = lanes.length;
      lanes.push({ segments: [] });
      laneEnds.push(-1);
    }
    lanes[laneIdx]!.segments.push(segment);
    laneEnds[laneIdx] = segment.endIndex;
  }
  return lanes;
}

/** Posición legible de un día dentro de un rango all-day (móvil). */
export function allDaySpanContextLabel(
  item: Pick<AgendaCalendarItem, "spanKey" | "spanStartYmd" | "spanEndYmd" | "start" | "allDay">,
  dayYmd: string,
): string | null {
  if (!item.spanKey || !item.spanStartYmd || !item.spanEndYmd) return null;
  const start = item.spanStartYmd;
  const end = item.spanEndYmd;
  if (end < start) return null;
  const dayIndex =
    Math.round(
      (Date.parse(`${dayYmd}T12:00:00.000Z`) - Date.parse(`${start}T12:00:00.000Z`)) /
        86_400_000,
    ) + 1;
  const total =
    Math.round(
      (Date.parse(`${end}T12:00:00.000Z`) - Date.parse(`${start}T12:00:00.000Z`)) /
        86_400_000,
    ) + 1;
  if (total < 1 || dayIndex < 1 || dayIndex > total) return null;
  const [, mm, dd] = end.split("-");
  return `día ${dayIndex} de ${total} · entrega ${dd}-${mm}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Altura de hora según prefs + alto disponible del scroll. */
export function resolveHourHeight(opts: {
  fitToWindow: boolean;
  hourHeight: number;
  startHour: number;
  endHour: number;
  availableHeight: number;
}): number {
  const span = Math.max(1, opts.endHour - opts.startHour);
  if (opts.fitToWindow && opts.availableHeight > 0) {
    return Math.max(CALENDAR_MIN_HOUR_HEIGHT, Math.round(opts.availableHeight / span));
  }
  return opts.hourHeight;
}
