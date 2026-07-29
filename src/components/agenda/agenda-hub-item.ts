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
  /** Responsable principal (compat). */
  assignedUserId?: string;
  /** Multi-responsable (tareas). */
  assignedUserIds?: string[];
  /** Negocio (licitaciones / tareas vinculadas). */
  dealId?: string | null;
};

/** ¿La tarea es del usuario actual? Sin assignees → visible (legacy). */
export function isHubTaskForUser(item: HubAgendaItem, userId: string): boolean {
  if (item.source !== "tarea") return true;
  const ids =
    item.assignedUserIds?.length
      ? item.assignedUserIds
      : item.assignedUserId
        ? [item.assignedUserId]
        : [];
  return ids.length === 0 || ids.includes(userId);
}

/** Deep-link al día de agenda (YYYY-MM-DD Chile). */
export function hubAgendaDayHref(ymd: string): string {
  return `/opai/agenda?date=${encodeURIComponent(ymd)}`;
}

/**
 * Destino al clickear un item de Agenda en Mi día.
 * Prioridad: detalle nativo (visita/licitación/tarea) → día + item en /opai/agenda.
 */
export function hubAgendaItemHref(item: HubAgendaItem): string {
  if (item.source === "agenda_visita") {
    return `/opai/agenda?visita=${encodeURIComponent(item.id)}`;
  }
  if (item.source === "licitacion" || item.type === "licitacion") {
    const id = item.dealId || item.id;
    return `/opai/agenda?licitacion=${encodeURIComponent(id)}`;
  }
  // Día del evento (all-day ymd puro o ISO → Chile).
  const day =
    item.allDay && /^\d{4}-\d{2}-\d{2}$/.test(item.start)
      ? item.start
      : new Date(item.start).toLocaleDateString("en-CA", {
          timeZone: "America/Santiago",
        });
  if (item.source === "tarea") {
    return `/opai/agenda?date=${encodeURIComponent(day)}&tarea=${encodeURIComponent(item.id)}`;
  }
  const source = item.source || item.type || "evento";
  return `/opai/agenda?date=${encodeURIComponent(day)}&item=${encodeURIComponent(`${source}:${item.id}`)}`;
}

/** Detalle de una tarea en /opai/tareas. */
export function hubTareaHref(taskId: string): string {
  return `/opai/tareas?task=${encodeURIComponent(taskId)}`;
}

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
