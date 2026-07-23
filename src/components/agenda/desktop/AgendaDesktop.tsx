"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Spinner } from "@/components/opai-ds";
import { cn } from "@/lib/utils";
import { startOfDayChile, ymdInChile } from "@/lib/dates-cl";
import { AgendaCalendarGrid } from "../AgendaCalendarGrid";
import { AgendaInspector } from "../AgendaInspector";
import {
  dateAtChileSlot,
  itemKey,
  navigateCalendar,
  visibleCalendarRange,
} from "../agenda-calendar-utils";
import type {
  AgendaCalendarItem,
  AgendaContentFilter,
  AgendaTypeFilter,
  AgendaViewMode,
} from "../agenda-calendar.types";
import { LicitacionDrawer } from "../LicitacionDrawer";
import { NuevaVisitaModal } from "../NuevaVisitaModal";
import { VisitDrawer } from "../VisitDrawer";
import { AgendaDesktopToolbar } from "./AgendaDesktopToolbar";
import { AgendaQuickCreate, type QuickCreateState } from "./AgendaQuickCreate";
import { AgendaRail } from "./AgendaRail";
import {
  agendaSourceKey,
  readDesktopPrefs,
  writeDesktopPrefs,
  type AgendaSourceKey,
} from "./agenda-desktop-prefs";
import { useAgendaDesktopData } from "./useAgendaDesktopData";
import { useAgendaShortcuts } from "./useAgendaShortcuts";

const CAL_RECONNECT_HREF =
  "/api/integrations/google-calendar/oauth/start?return=/opai/agenda";

/** Alto disponible bajo el header + subnav: el shell mide su propio offset. */
function useFillViewportHeight(ref: React.RefObject<HTMLElement | null>): string {
  const [height, setHeight] = useState("calc(100dvh - 10rem)");
  useLayoutEffect(() => {
    const update = () => {
      const top = ref.current?.getBoundingClientRect().top ?? 160;
      setHeight(`calc(100dvh - ${Math.max(0, Math.round(top))}px - 24px)`);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [ref]);
  return height;
}

/** Agenda desktop (≥lg): layout de alto completo estilo Notion Calendar. */
export function AgendaDesktop() {
  const search = useSearchParams();
  const [anchor, setAnchor] = useState(() => startOfDayChile(new Date()));
  const [view, setView] = useState<AgendaViewMode>("week");
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [hiddenSources, setHiddenSources] = useState<AgendaSourceKey[]>([]);
  const [query, setQuery] = useState("");
  const [contentFilter, setContentFilter] = useState<AgendaContentFilter>("todo");
  const [typeFilter, setTypeFilter] = useState<AgendaTypeFilter>("todos");
  const [assignedUserIds, setAssignedUserIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<AgendaCalendarItem | null>(null);
  const [quickCreate, setQuickCreate] = useState<QuickCreateState | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [visitaId, setVisitaId] = useState<string | null>(null);
  const [licId, setLicId] = useState<string | null>(null);

  const shellRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const shellHeight = useFillViewportHeight(shellRef);

  const range = useMemo(() => visibleCalendarRange(anchor, view, 3), [anchor, view]);
  const { items, users, googleStatus, google, loading, load, persistSchedule } =
    useAgendaDesktopData(range);

  const prefsMounted = useRef(false);
  useEffect(() => {
    if (!prefsMounted.current) {
      prefsMounted.current = true;
      const prefs = readDesktopPrefs();
      setView(prefs.view);
      setRailCollapsed(prefs.railCollapsed);
      setHiddenSources(prefs.hiddenSources);
      return;
    }
    writeDesktopPrefs({ view, railCollapsed, hiddenSources });
  }, [view, railCollapsed, hiddenSources]);

  const ctx = useMemo(
    () => ({
      dealId: search.get("dealId"),
      accountId: search.get("accountId"),
      installationId: search.get("installationId"),
    }),
    [search],
  );

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
  const googleByUserId = useMemo(() => {
    if (!google || google.team.length === 0) return null;
    return new Map(google.team.map((member) => [member.userId, member.connected]));
  }, [google]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hidden = new Set(hiddenSources);
    return items.filter((item) => {
      if (hidden.has(agendaSourceKey(item))) return false;
      const isTask = item.source === "tarea";
      if (contentFilter === "tareas" && !isTask) return false;
      if (contentFilter === "reuniones" && isTask) return false;
      if (!isTask && typeFilter !== "todos" && item.type !== typeFilter) return false;
      if (assignedUserIds.length > 0 && !assignedUserIds.includes(item.assignedUserId)) {
        return false;
      }
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
  }, [items, hiddenSources, contentFilter, typeFilter, assignedUserIds, query]);

  const handleSelect = useCallback((item: AgendaCalendarItem) => {
    setSelected(item);
  }, []);

  const visibleDays = useMemo(
    () => new Set(range.days.map((day) => ymdInChile(day))),
    [range.days],
  );

  const sourceCounts = useMemo(() => {
    const counts: Partial<Record<AgendaSourceKey, number>> = {};
    for (const item of items) {
      const key = agendaSourceKey(item);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [items]);

  const toggleSource = useCallback((key: AgendaSourceKey) => {
    setHiddenSources((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
    );
  }, []);

  useAgendaShortcuts({
    onCreate: useCallback(() => setQuickCreate({ mode: "evento", origin: null }), []),
    onFocusSearch: useCallback(() => searchRef.current?.focus(), []),
    onToday: useCallback(() => setAnchor(startOfDayChile(new Date())), []),
    onViewChange: setView,
    onPrevious: useCallback(
      () => setAnchor((current) => navigateCalendar(current, view, 3, -1)),
      [view],
    ),
    onNext: useCallback(
      () => setAnchor((current) => navigateCalendar(current, view, 3, 1)),
      [view],
    ),
    onEscape: useCallback(() => {
      setQuickCreate((qc) => {
        if (qc) return null;
        setSelected(null);
        return qc;
      });
    }, []),
  });

  // El contenido del inspector permanece montado durante la animación de cierre.
  const lastSelectedRef = useRef<AgendaCalendarItem | null>(null);
  if (selected) lastSelectedRef.current = selected;
  const inspectorItem = selected ?? lastSelectedRef.current;

  const selectedKey = selected ? itemKey(selected) : null;

  return (
    <div
      ref={shellRef}
      className="ds-page-enter flex min-w-0 flex-col overflow-hidden"
      style={{ height: shellHeight }}
    >
      {(googleStatus === "missing_scope" ||
        googleStatus === "insufficient_scopes" ||
        googleStatus === "error") && (
        <div className="mb-2 flex shrink-0 items-center justify-between gap-3 rounded-xl border border-status-warn-border bg-status-warn-soft px-3 py-1.5 text-[13px] text-status-warn-fg">
          <span>
            {googleStatus === "error"
              ? "No pudimos leer tu Google Calendar (token expirado o revocado)."
              : "Reconectá tu Calendar para ver tus eventos — Opai necesita permiso de lectura."}
          </span>
          <a href={CAL_RECONNECT_HREF} className="shrink-0 font-medium underline underline-offset-2">
            Reconectar
          </a>
        </div>
      )}

      <AgendaDesktopToolbar
        anchor={anchor}
        view={view}
        query={query}
        users={users}
        assignedUserIds={assignedUserIds}
        googleByUserId={googleByUserId}
        contentFilter={contentFilter}
        typeFilter={typeFilter}
        searchRef={searchRef}
        onToggleRail={() => setRailCollapsed((current) => !current)}
        onPrevious={() => setAnchor((current) => navigateCalendar(current, view, 3, -1))}
        onNext={() => setAnchor((current) => navigateCalendar(current, view, 3, 1))}
        onToday={() => setAnchor(startOfDayChile(new Date()))}
        onViewChange={setView}
        onQueryChange={setQuery}
        onAssignedUserIdsChange={setAssignedUserIds}
        onContentFilterChange={setContentFilter}
        onTypeFilterChange={setTypeFilter}
        onCreate={() => setQuickCreate({ mode: "evento", origin: null })}
      />

      <div className="flex min-h-0 flex-1 gap-3 pt-3">
        <AgendaRail
          collapsed={railCollapsed}
          anchor={anchor}
          visibleDays={visibleDays}
          hiddenSources={hiddenSources}
          counts={sourceCounts}
          google={google}
          onSelectDate={(ymd) => setAnchor(dateAtChileSlot(ymd, 0))}
          onToggleSource={toggleSource}
        />
        <div className="min-w-0 flex-1">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Spinner />
            </div>
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
              onOpenDay={(ymd) => {
                setAnchor(dateAtChileSlot(ymd, 0));
                setView("day");
              }}
              onSlotClick={(dateKey, minute, origin) =>
                setQuickCreate({ mode: "evento", origin, dateKey, minute })
              }
            />
          )}
        </div>

        {/* Push-panel: empuja el grid con transición de ancho, solo on-select. */}
        <div
          className={cn(
            "shrink-0 overflow-hidden transition-[width] duration-200",
            selected ? "w-[340px]" : "w-0",
          )}
          aria-hidden={!selected}
        >
          {inspectorItem && (
            <div className="h-full w-[340px]">
              <AgendaInspector
                item={inspectorItem}
                users={users}
                onClose={() => setSelected(null)}
                onChanged={() => {
                  void load();
                  setSelected(null);
                }}
              />
            </div>
          )}
        </div>
      </div>

      {quickCreate && (
        <AgendaQuickCreate
          state={quickCreate}
          users={users}
          onClose={() => setQuickCreate(null)}
          onCreated={() => void load()}
        />
      )}

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
