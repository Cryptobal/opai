"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { AgendaListItem } from "@/modules/agenda/agenda.types";
import type {
  AgendaCalendarItem,
  AgendaSchedule,
  AgendaTeamMember,
} from "../agenda-calendar.types";
import type { CalendarRange } from "../agenda-calendar-utils";

export type GoogleAccountStatus = {
  connected: boolean;
  googleEmail: string | null;
  /** Solo admins reciben el detalle del equipo (quién tiene Google conectado). */
  team: Array<{ userId: string; name: string; connected: boolean }>;
};

function normalizeItem(item: AgendaListItem): AgendaCalendarItem {
  return {
    id: item.id,
    source: item.source,
    type: item.type,
    title: item.title,
    start: item.start,
    end: item.end,
    allDay: item.allDay,
    syncStatus: item.syncStatus,
    dealId: item.dealId,
    assignedUserId: item.assignedUserId,
    assignedName: item.assignedName,
    assignedUserIds: item.assignedUserIds,
    assignedNames: item.assignedNames,
    accountName: item.accountName,
    installationName: item.installationName,
    address: item.address,
    status: item.status,
    htmlLink: item.htmlLink,
    calendarName: item.calendarName,
    href: item.href,
  };
}

/** Datos + persistencia de la agenda desktop (items por rango, equipo, Google). */
export function useAgendaDesktopData(range: CalendarRange) {
  const [items, setItems] = useState<AgendaCalendarItem[]>([]);
  const [users, setUsers] = useState<AgendaTeamMember[]>([]);
  const [googleStatus, setGoogleStatus] = useState<string | null>(null);
  const [google, setGoogle] = useState<GoogleAccountStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/crm/users")
      .then((r) => r.json())
      .then((json) =>
        setUsers(
          (json.data?.users ?? []).map(
            (user: { id: string; name: string; email?: string }) => ({
              id: user.id,
              name: user.name,
              email: user.email,
            }),
          ),
        ),
      )
      .catch(() => setUsers([]));

    fetch("/api/integrations/google-calendar/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) =>
        setGoogle(
          json
            ? {
                connected: json.connected === true,
                googleEmail: json.googleEmail ?? null,
                team: Array.isArray(json.team) ? json.team : [],
              }
            : null,
        ),
      )
      .catch(() => setGoogle(null));
  }, []);

  // Deps por epoch (number): `range.from`/`range.to` son Date nuevos en cada
  // recálculo de visibleCalendarRange aunque el instante sea el mismo; si
  // usáramos las refs Date, `load` cambiaría de identidad y re-dispararía
  // efectos que lo listan como dependencia.
  const fromMs = range.from.getTime();
  const toMs = range.to.getTime();
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/agenda?from=${new Date(fromMs).toISOString()}&to=${new Date(toMs).toISOString()}`,
      ).then((r) => r.json());
      setItems((res.items ?? []).map(normalizeItem));
      setGoogleStatus(res.googleStatus ?? null);
    } finally {
      setLoading(false);
    }
  }, [fromMs, toMs]);

  useEffect(() => {
    void load();
  }, [load]);

  const persistSchedule = useCallback(
    async (item: AgendaCalendarItem, schedule: AgendaSchedule) => {
      if (item.source === "agenda_visita") {
        const r = await fetch(`/api/agenda/visitas/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            startAt: schedule.start.toISOString(),
            endAt: schedule.end.toISOString(),
          }),
        }).catch(() => null);
        if (!r?.ok) {
          toast.error("No se pudo reprogramar la visita");
          return;
        }
        const data = (await r.json().catch(() => ({}))) as {
          sync?: { syncStatus?: string };
        };
        toast.success(
          data.sync?.syncStatus === "SYNCED"
            ? "Visita reprogramada · Google Calendar actualizado"
            : "Visita reprogramada",
        );
        void load();
        return;
      }

      if (item.source === "tarea") {
        const r = await fetch(`/api/crm/tasks/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dueAt: schedule.start.toISOString(),
            allDay: schedule.allDay,
          }),
        }).catch(() => null);
        if (!r?.ok) {
          toast.error("No se pudo mover la tarea");
          return;
        }
        toast.success("Tarea movida");
        void load();
      }
    },
    [load],
  );

  return { items, users, googleStatus, google, loading, load, persistSchedule };
}
