"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { AgendaListItem } from "@/modules/agenda/agenda.types";
import type {
  AgendaCalendarItem,
  AgendaSchedule,
  AgendaTeamMember,
} from "../agenda-calendar.types";
import { formatAgendaTime, type CalendarRange } from "../agenda-calendar-utils";
import { consumeLegacyHiddenSources } from "./agenda-desktop-prefs";
import type { CalendarSource } from "./AgendaCalendarList";

export type CalendarAccount = {
  id: string;
  googleEmail: string;
  isDefault: boolean;
  color: string | null;
  calendarId: string;
  status: string;
  sortIndex: number;
};

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
    createdBy: item.createdBy,
    sourceKey: item.sourceKey,
  };
}

function scheduleLabel(schedule: AgendaSchedule): string {
  if (schedule.allDay) return "Todo el día";
  return `${formatAgendaTime(schedule.start)}–${formatAgendaTime(schedule.end)}`;
}

/** Datos + persistencia de la agenda desktop (items por rango, fuentes, Google). */
export function useAgendaDesktopData(range: CalendarRange) {
  const [items, setItems] = useState<AgendaCalendarItem[]>([]);
  const [users, setUsers] = useState<AgendaTeamMember[]>([]);
  const [sources, setSources] = useState<CalendarSource[]>([]);
  const [accounts, setAccounts] = useState<CalendarAccount[]>([]);
  const [multiEnabled, setMultiEnabled] = useState(false);
  const [googleStatus, setGoogleStatus] = useState<string | null>(null);
  const [google, setGoogle] = useState<GoogleAccountStatus | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const hasLoadedOnce = useRef(false);
  const legacySeeded = useRef(false);

  const colorBySource = useMemo(
    () => Object.fromEntries(sources.map((s) => [s.sourceKey, s.color])),
    [sources],
  );

  const loadSources = useCallback(async () => {
    const legacy = !legacySeeded.current ? consumeLegacyHiddenSources() : null;
    if (legacy) legacySeeded.current = true;
    const qs = legacy?.length
      ? `?seedLegacy=${encodeURIComponent(JSON.stringify(legacy))}`
      : "";
    const res = await fetch(`/api/calendar/sources${qs}`);
    if (!res.ok) return;
    const json = (await res.json()) as {
      sources?: CalendarSource[];
      accounts?: CalendarAccount[];
      multiAccount?: { enabled?: boolean; canConnect?: boolean };
    };
    setSources(json.sources ?? []);
    setAccounts(json.accounts ?? []);
    setMultiEnabled(json.multiAccount?.enabled === true);
  }, []);

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

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
      .then((json) => {
        if (!json) return;
        setGoogle({
          connected: json.connected === true,
          googleEmail: json.googleEmail ?? null,
          team: Array.isArray(json.team) ? json.team : [],
        });
      })
      .catch(() => setGoogle(null));
  }, []);

  useEffect(() => {
    if (accounts.length === 0) return;
    setGoogle((prev) => ({
      connected: true,
      googleEmail: accounts[0]?.googleEmail ?? prev?.googleEmail ?? null,
      team: prev?.team ?? [],
    }));
  }, [accounts]);

  const fromMs = range.from.getTime();
  const toMs = range.to.getTime();
  const load = useCallback(async () => {
    if (hasLoadedOnce.current) setRefreshing(true);
    else setInitialLoading(true);
    try {
      const res = await fetch(
        `/api/agenda?from=${new Date(fromMs).toISOString()}&to=${new Date(toMs).toISOString()}`,
      ).then((r) => r.json());
      setItems((res.items ?? []).map(normalizeItem));
      setGoogleStatus(res.googleStatus ?? null);
    } finally {
      hasLoadedOnce.current = true;
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [fromMs, toMs]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchSource = useCallback(
    async (
      sourceKey: string,
      patch: { color?: string; hidden?: boolean; isCreateTarget?: boolean },
    ) => {
      const res = await fetch("/api/calendar/sources", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceKey, ...patch }),
      }).catch(() => null);

      if (!res?.ok) {
        toast.error("No se pudo actualizar el calendario");
        return;
      }

      const json = (await res.json()) as { source?: CalendarSource; sources?: CalendarSource[] };
      if (json.sources) {
        setSources(json.sources);
      } else if (json.source) {
        setSources((current) =>
          current.map((s) => (s.sourceKey === sourceKey ? json.source! : s)),
        );
        if (patch.isCreateTarget) {
          setSources((current) =>
            current.map((s) =>
              s.sourceKey === sourceKey
                ? { ...s, isCreateTarget: true }
                : s.kind === "google"
                  ? { ...s, isCreateTarget: false }
                  : s,
            ),
          );
        }
      } else {
        await loadSources();
      }
    },
    [loadSources],
  );

  const persistSchedule = useCallback(
    async (item: AgendaCalendarItem, schedule: AgendaSchedule) => {
      const fromLabel = item.allDay
        ? "Todo el día"
        : `${formatAgendaTime(new Date(item.start))}–${formatAgendaTime(new Date(item.end))}`;
      const toLabel = scheduleLabel(schedule);

      setItems((current) =>
        current.map((entry) =>
          entry.id === item.id && entry.source === item.source
            ? {
                ...entry,
                start: schedule.allDay
                  ? schedule.start.toISOString().slice(0, 10)
                  : schedule.start.toISOString(),
                end: schedule.allDay
                  ? schedule.end.toISOString().slice(0, 10)
                  : schedule.end.toISOString(),
                allDay: schedule.allDay,
              }
            : entry,
        ),
      );

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
          void load();
          return;
        }
        const data = (await r.json().catch(() => ({}))) as {
          sync?: { syncStatus?: string };
        };
        toast.success(
          data.sync?.syncStatus === "SYNCED"
            ? `${fromLabel} → ${toLabel} · Google Calendar actualizado`
            : `${fromLabel} → ${toLabel}`,
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
          void load();
          return;
        }
        toast.success(`${fromLabel} → ${toLabel}`);
        void load();
      }
    },
    [load],
  );

  return {
    items,
    users,
    sources,
    accounts,
    multiEnabled,
    colorBySource,
    googleStatus,
    google,
    initialLoading,
    refreshing,
    /** @deprecated usar initialLoading — alias de compat. */
    loading: initialLoading,
    load,
    loadSources,
    patchSource,
    persistSchedule,
  };
}
