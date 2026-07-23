"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { addDaysChile } from "@/lib/dates-cl";
import type { AgendaListItem } from "@/modules/agenda/agenda.types";
import { agendaItemDayKey, dateAtChileSlot, monthGridDays } from "../agenda-calendar-utils";
import type {
  AgendaCalendarItem,
  AgendaContentFilter,
  AgendaTeamMember,
  AgendaTypeFilter,
} from "../agenda-calendar.types";
import type { AgendaMobileView } from "./agenda-mobile-utils";

/** Rango a pedir según vista: Agenda = día elegido + 6; Día = 1; Mes = grilla. */
function rangeFor(view: AgendaMobileView, ymd: string): { from: Date; to: Date } {
  const dayStart = dateAtChileSlot(ymd, 0);
  if (view === "day") return { from: dayStart, to: addDaysChile(dayStart, 1) };
  if (view === "month") {
    const days = monthGridDays(dayStart);
    return { from: days[0], to: addDaysChile(days[days.length - 1], 1) };
  }
  return { from: dayStart, to: addDaysChile(dayStart, 7) };
}

export type AgendaMobileFilters = {
  contentFilter: AgendaContentFilter;
  typeFilter: AgendaTypeFilter;
  assignedUserId: string;
};

export function useAgendaMobileData(view: AgendaMobileView, selectedYmd: string) {
  const [items, setItems] = useState<AgendaCalendarItem[]>([]);
  const [users, setUsers] = useState<AgendaTeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const range = useMemo(() => rangeFor(view, selectedYmd), [view, selectedYmd]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(
        `/api/agenda?from=${range.from.toISOString()}&to=${range.to.toISOString()}`,
      );
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as { items?: AgendaListItem[] };
      setItems((json.items ?? []) as AgendaCalendarItem[]);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    fetch("/api/crm/users")
      .then((r) => r.json())
      .then((json) =>
        setUsers(
          (json.data?.users ?? []).map((u: { id: string; name: string; email?: string }) => ({
            id: u.id,
            name: u.name,
            email: u.email,
          })),
        ),
      )
      .catch(() => setUsers([]));
  }, []);

  return { items, users, loading, error, reload: load };
}

export function filterMobileItems(
  items: AgendaCalendarItem[],
  filters: AgendaMobileFilters,
): AgendaCalendarItem[] {
  return items.filter((item) => {
    const isTask = item.source === "tarea";
    if (filters.contentFilter === "tareas" && !isTask) return false;
    if (filters.contentFilter === "reuniones" && isTask) return false;
    if (!isTask && filters.typeFilter !== "todos" && item.type !== filters.typeFilter)
      return false;
    if (filters.assignedUserId && item.assignedUserId !== filters.assignedUserId)
      return false;
    return true;
  });
}

/** Días (ymd Chile) que tienen al menos un evento — dots de la tira y el mes. */
export function daysWithEventsSet(items: AgendaCalendarItem[]): Set<string> {
  const set = new Set<string>();
  for (const item of items) set.add(agendaItemDayKey(item));
  return set;
}
