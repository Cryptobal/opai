"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, PageHero, Spinner, Surface } from "@/components/opai-ds";
import { startOfDayChile } from "@/lib/dates-cl";
import type { AgendaListItem } from "@/modules/agenda/agenda.types";
import { AgendaCalendarGrid } from "./AgendaCalendarGrid";
import { AgendaInspector } from "./AgendaInspector";
import { AgendaToolbar } from "./AgendaToolbar";
import {
  formatAgendaPeriod,
  itemKey,
  navigateCalendar,
  visibleCalendarRange,
} from "./agenda-calendar-utils";
import type {
  AgendaCalendarItem,
  AgendaContentFilter,
  AgendaSchedule,
  AgendaTeamMember,
  AgendaTypeFilter,
  AgendaViewMode,
} from "./agenda-calendar.types";
import { LicitacionesList, type LicRow } from "./LicitacionesList";
import { LicitacionDrawer } from "./LicitacionDrawer";
import { NuevaVisitaModal } from "./NuevaVisitaModal";
import { VisitList } from "./VisitList";
import { VisitDrawer } from "./VisitDrawer";
import { AgendaMobile } from "./mobile/AgendaMobile";
import { useIsMobileAgenda } from "./mobile/agenda-mobile-utils";

const CAL_RECONNECT_HREF =
  "/api/integrations/google-calendar/oauth/start?return=/opai/agenda";
const PREFS_KEY = "opai-agenda-prefs";

type AgendaPrefs = {
  view: AgendaViewMode;
  multiDays: number;
};

function readPrefs(): AgendaPrefs {
  if (typeof window === "undefined") return { view: "multi", multiDays: 3 };
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return { view: "multi", multiDays: 3 };
    const parsed = JSON.parse(raw) as Partial<AgendaPrefs>;
    const validViews: AgendaViewMode[] = ["day", "multi", "week", "month"];
    return {
      view: parsed.view && validViews.includes(parsed.view) ? parsed.view : "multi",
      multiDays:
        typeof parsed.multiDays === "number" &&
        parsed.multiDays >= 2 &&
        parsed.multiDays <= 6
          ? parsed.multiDays
          : 3,
    };
  } catch {
    return { view: "multi", multiDays: 3 };
  }
}

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
    accountName: item.accountName,
    installationName: item.installationName,
    address: item.address,
    status: item.status,
    htmlLink: item.htmlLink,
    calendarName: item.calendarName,
    href: item.href,
  };
}

export function AgendaPageClient() {
  const isMobile = useIsMobileAgenda();
  if (isMobile) return <AgendaMobile />;
  return <AgendaPageDesktop />;
}

function AgendaPageDesktop() {
  const search = useSearchParams();
  const [anchor, setAnchor] = useState(() => startOfDayChile(new Date()));
  const [view, setView] = useState<AgendaViewMode>("multi");
  const [multiDays, setMultiDays] = useState(3);
  const [items, setItems] = useState<AgendaCalendarItem[]>([]);
  const [lics, setLics] = useState<LicRow[]>([]);
  const [users, setUsers] = useState<AgendaTeamMember[]>([]);
  const [googleStatus, setGoogleStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [contentFilter, setContentFilter] = useState<AgendaContentFilter>("todo");
  const [typeFilter, setTypeFilter] = useState<AgendaTypeFilter>("todos");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [selected, setSelected] = useState<AgendaCalendarItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [visitaId, setVisitaId] = useState<string | null>(null);
  const [licId, setLicId] = useState<string | null>(null);

  const range = useMemo(
    () => visibleCalendarRange(anchor, view, multiDays),
    [anchor, view, multiDays],
  );

  const ctx = useMemo(
    () => ({
      dealId: search.get("dealId"),
      accountId: search.get("accountId"),
      installationId: search.get("installationId"),
    }),
    [search],
  );

  const prefsMounted = useRef(false);
  useEffect(() => {
    if (!prefsMounted.current) {
      prefsMounted.current = true;
      const prefs = readPrefs();
      setView(prefs.view);
      setMultiDays(prefs.multiDays);
      return;
    }
    window.localStorage.setItem(PREFS_KEY, JSON.stringify({ view, multiDays }));
  }, [view, multiDays]);

  useEffect(() => {
    fetch("/api/crm/users")
      .then((r) => r.json())
      .then((json) =>
        setUsers(
          (json.data?.users ?? []).map((user: { id: string; name: string; email?: string }) => ({
            id: user.id,
            name: user.name,
            email: user.email,
          })),
        ),
      )
      .catch(() => setUsers([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [agendaRes, licRes] = await Promise.all([
        fetch(`/api/agenda?from=${range.from.toISOString()}&to=${range.to.toISOString()}`).then(
          (r) => r.json(),
        ),
        fetch("/api/agenda/licitaciones").then((r) => r.json()),
      ]);
      setItems((agendaRes.items ?? []).map(normalizeItem));
      setGoogleStatus(agendaRes.googleStatus ?? null);
      setLics(licRes.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    void load();
  }, [load]);

  const calHandled = useRef(false);
  useEffect(() => {
    if (search.get("nueva") === "1") setModalOpen(true);
    if (search.get("visita")) setVisitaId(search.get("visita"));
    if (search.get("licitacion")) setLicId(search.get("licitacion"));
    const cal = search.get("cal");
    if (!cal || calHandled.current) return;
    calHandled.current = true;
    if (cal === "connected") {
      toast.success("Calendar conectado — tus eventos ya aparecen");
      void load();
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("cal");
    window.history.replaceState({}, "", url.pathname + url.search);
  }, [search, load]);

  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      const isTask = item.source === "tarea";
      if (contentFilter === "tareas" && !isTask) return false;
      if (contentFilter === "reuniones" && isTask) return false;
      if (!isTask && typeFilter !== "todos" && item.type !== typeFilter) return false;
      if (assignedUserId && item.assignedUserId !== assignedUserId) return false;
      if (!q) return true;
      const haystack = [
        item.title,
        item.accountName,
        item.installationName,
        item.assignedName,
        item.type,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [items, contentFilter, typeFilter, assignedUserId, query]);

  const handleSelect = useCallback((item: AgendaCalendarItem) => {
    setSelected(item);
  }, []);

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
        const data = (await r.json().catch(() => ({}))) as { sync?: { syncStatus?: string } };
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

  const periodLabel = formatAgendaPeriod(anchor, view, multiDays);
  const selectedKey = selected ? itemKey(selected) : null;

  return (
    <div className="ds-page-enter space-y-4">
      <PageHero
        icon={CalendarDays}
        iconTone="violet"
        title="Agenda"
        subtitle="Visitas, reuniones y tareas"
        description="Calendario comercial unificado con arrastre, vistas flexibles y asignación de equipo."
      />

      <AgendaToolbar
        periodLabel={periodLabel}
        view={view}
        multiDays={multiDays}
        query={query}
        contentFilter={contentFilter}
        typeFilter={typeFilter}
        assignedUserId={assignedUserId}
        users={users}
        onPrevious={() => setAnchor((current) => navigateCalendar(current, view, multiDays, -1))}
        onNext={() => setAnchor((current) => navigateCalendar(current, view, multiDays, 1))}
        onToday={() => setAnchor(startOfDayChile(new Date()))}
        onViewChange={setView}
        onMultiDaysChange={setMultiDays}
        onQueryChange={setQuery}
        onContentFilterChange={setContentFilter}
        onTypeFilterChange={setTypeFilter}
        onAssignedUserChange={setAssignedUserId}
        onCreate={() => setModalOpen(true)}
      />

      {(googleStatus === "missing_scope" || googleStatus === "insufficient_scopes") && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-status-warn-border bg-status-warn-soft px-3 py-2.5 text-[13px] text-status-warn-fg">
          <span>
            Reconectá tu Calendar para ver tus eventos — Opai necesita permiso de lectura
          </span>
          <a href={CAL_RECONNECT_HREF} className="shrink-0 font-medium underline underline-offset-2">
            Reconectar
          </a>
        </div>
      )}

      {googleStatus === "error" && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-status-warn-border bg-status-warn-soft px-3 py-2 text-[13px] text-status-warn-fg">
          <span>No pudimos leer tu Google Calendar (token expirado o revocado).</span>
          <a href={CAL_RECONNECT_HREF} className="shrink-0 font-medium underline underline-offset-2">
            Reconectar Calendar
          </a>
        </div>
      )}

      <div className="grid min-h-[640px] gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          {loading ? (
            <div className="flex justify-center py-24">
              <Spinner />
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="Agenda libre — crea la primera visita o tarea"
              description="Tu calendario está listo. Arrastra eventos entre días y horas cuando empieces a planificar."
              action={
                <button
                  type="button"
                  onClick={() => setModalOpen(true)}
                  className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-[13px] font-medium text-primary-foreground ds-tap sm:h-9"
                >
                  Crear
                </button>
              }
            />
          ) : (
            <AgendaCalendarGrid
              anchor={anchor}
              days={range.days}
              items={filtered}
              view={view}
              selectedKey={selectedKey}
              usersById={usersById}
              onSelect={handleSelect}
              onMove={(item, schedule) => void persistSchedule(item, schedule)}
              onResize={(item, schedule) => void persistSchedule(item, schedule)}
            />
          )}
        </div>

        <div className="hidden min-h-0 xl:block">
          {selected ? (
            <AgendaInspector
              item={selected}
              users={users}
              onClose={() => setSelected(null)}
              onChanged={() => {
                void load();
                setSelected(null);
              }}
            />
          ) : (
            <Surface elevation={1} padding="md" className="h-full space-y-3 shadow-none">
              <p className="text-xs uppercase tracking-wide text-ds-text-4">Inspector</p>
              <p className="text-[13px] text-ds-text-3">
                Selecciona una visita, reunión o tarea para editarla, reasignarla o completarla sin
                salir del calendario.
              </p>
            </Surface>
          )}
        </div>
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/40 xl:hidden"
          onClick={() => setSelected(null)}
        >
          <div
            className="max-h-[88vh] w-full overflow-y-auto p-2"
            onClick={(event) => event.stopPropagation()}
          >
            <AgendaInspector
              item={selected}
              users={users}
              onClose={() => setSelected(null)}
              onChanged={() => {
                void load();
                setSelected(null);
              }}
            />
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Surface elevation={1} padding="md" className="space-y-3 shadow-none">
          <p className="text-xs uppercase tracking-wide text-ds-text-4">Próximas visitas</p>
          <VisitList
            items={filtered.filter((item) => item.source !== "tarea")}
            onSelect={(item) => {
              if (item.source === "agenda_visita") setVisitaId(item.id);
            }}
          />
        </Surface>
        <Surface elevation={1} padding="md" className="space-y-3 shadow-none">
          <p className="text-xs uppercase tracking-wide text-ds-text-4">Licitaciones en carpeta</p>
          <LicitacionesList items={lics} onSelect={setLicId} />
        </Surface>
      </div>

      <NuevaVisitaModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        dealId={ctx.dealId}
        accountId={ctx.accountId}
        installationId={ctx.installationId}
        onCreated={() => void load()}
      />
      <VisitDrawer
        visitaId={visitaId}
        onClose={() => setVisitaId(null)}
        onChanged={() => void load()}
      />
      <LicitacionDrawer
        dealId={licId}
        onClose={() => setLicId(null)}
        onAgendar={() => {
          setLicId(null);
          setModalOpen(true);
        }}
      />
    </div>
  );
}
