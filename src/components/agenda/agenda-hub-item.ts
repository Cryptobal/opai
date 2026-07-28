export type HubAgendaItem = {
  id: string;
  source?: string;
  type: string;
  title: string;
  start: string;
  /** Fin del evento (ISO). Ausente en payloads legacy → se asume 60 min. */
  end?: string;
  allDay: boolean;
  syncStatus: string | null;
  htmlLink?: string | null;
  calendarName?: string | null;
  href?: string | null;
  accountName?: string | null;
  installationName?: string | null;
};

export function hhmm(start: string): string {
  return new Date(start).toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Santiago",
  });
}

/** Duración en minutos; fallback 60 si falta `end`. */
export function agendaDurationMin(item: HubAgendaItem): number {
  if (!item.end) return 60;
  const ms = new Date(item.end).getTime() - new Date(item.start).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 60;
  return Math.max(1, Math.round(ms / 60_000));
}

export function formatDurationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Texto "en Xh Ym" / "en Xm" a partir de un instante futuro. */
export function formatRemainingLabel(startIso: string, now = new Date()): string {
  const ms = new Date(startIso).getTime() - now.getTime();
  if (ms <= 0) return "ahora";
  const totalMin = Math.max(1, Math.round(ms / 60_000));
  return `en ${formatDurationLabel(totalMin)}`;
}

export type FreeSlot = {
  start: Date;
  end: Date;
  minutes: number;
};

const FREE_SLOT_MIN = 45;

/**
 * Huecos libres ≥ 45 min entre eventos timed del día (ignora allDay).
 * Rango laboral implícito: del inicio del primer evento o 08:00 Chile
 * hasta el fin del último o 19:00 Chile — usa los bounds de los eventos.
 */
export function computeFreeSlots(
  dayItems: HubAgendaItem[],
  dayStart: Date,
  dayEnd: Date,
): FreeSlot[] {
  const timed = dayItems
    .filter((i) => !i.allDay)
    .map((i) => ({
      start: new Date(i.start),
      end: new Date(i.end ?? new Date(i.start).getTime() + 60 * 60_000),
    }))
    .filter((i) => Number.isFinite(i.start.getTime()) && Number.isFinite(i.end.getTime()))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  if (timed.length === 0) return [];

  const slots: FreeSlot[] = [];
  const endBound = Math.max(dayEnd.getTime(), dayStart.getTime());
  // Empieza tras el primer evento: no inventar un hueco desde medianoche.
  let cursor = timed[0].end.getTime();

  for (let i = 1; i < timed.length; i++) {
    const ev = timed[i];
    const gapStart = cursor;
    const gapEnd = Math.min(ev.start.getTime(), endBound);
    if (gapEnd - gapStart >= FREE_SLOT_MIN * 60_000) {
      slots.push({
        start: new Date(gapStart),
        end: new Date(gapEnd),
        minutes: Math.round((gapEnd - gapStart) / 60_000),
      });
    }
    cursor = Math.max(cursor, ev.end.getTime());
  }

  if (endBound - cursor >= FREE_SLOT_MIN * 60_000) {
    slots.push({
      start: new Date(cursor),
      end: new Date(endBound),
      minutes: Math.round((endBound - cursor) / 60_000),
    });
  }

  return slots;
}
