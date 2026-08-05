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
  displayCalendarDays,
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
import { AgendaTaskDetail } from "./AgendaTaskDetail";
import {
  DEFAULT_AGENDA_PREFS,
  itemSourceKey,
  readDesktopPrefs,
  toGridPrefs,
  writeDesktopPrefs,
  type AgendaDesktopPrefs,
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

function clearSearchParam(key: string) {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(key)) return;
  url.searchParams.delete(key);
  window.history.replaceState({}, "", url.pathname + url.search);
}

/** Agenda desktop (≥lg): layout de alto completo estilo Notion Calendar. */
export function AgendaDesktop({
  currentUserId,
  userRole,
}: {
  currentUserId: string;
  userRole: string;
}) {
  const search = useSearchParams();
  const [anchor, setAnchor] = useState(() => startOfDayChile(new Date()));
  const [prefs, setPrefs] = useState<AgendaDesktopPrefs>(DEFAULT_AGENDA_PREFS);
  const [query, setQuery] = useState("");
  const [contentFilter, setContentFilter] = useState<AgendaContentFilter>("todo");
  const [typeFilter, setTypeFilter] = useState<AgendaTypeFilter>("todos");
  const [assignedUserIds, setAssignedUserIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<AgendaCalendarItem | null>(null);
  const [taskDetailId, setTaskDetailId] = useState<string | null>(null);
  const [quickCreate, setQuickCreate] = useState<QuickCreateState | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [visitaId, setVisitaId] = useState<string | null>(null);
  const [licId, setLicId] = useState<string | null>(null);

  const shellRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const shellHeight = useFillViewportHeight(shellRef);

  const view = prefs.view;
  const railCollapsed = prefs.railCollapsed;

  const range = useMemo(
    () =>
      visibleCalendarRange(anchor, view, 3, {
        firstDay: prefs.firstDay,
        showWeekends: prefs.showWeekends,
      }),
    [anchor, view, prefs.firstDay, prefs.showWeekends],
  );
  const displayDays = useMemo(
    () => displayCalendarDays(range.days, view, prefs.showWeekends),
    [range.days, view, prefs.showWeekends],
  );

  const {
    items,
    users,
    sources,
    multiEnabled,
    colorBySource,
    googleStatus,
    google,
    initialLoading,
    refreshing,
    load,
    patchSource,
    persistSchedule,
  } = useAgendaDesktopData(range);

  const prefsMounted = useRef(false);
  useEffect(() => {
    if (!prefsMounted.current) {
      prefsMounted.current = true;
      setPrefs(readDesktopPrefs());
      return;
    }
    writeDesktopPrefs(prefs);
  }, [prefs]);

  const updatePrefs = useCallback((next: AgendaDesktopPrefs) => {
    setPrefs(next);
  }, []);

  const setView = useCallback((next: AgendaViewMode) => {
    setPrefs((current) => ({ ...current, view: next }));
  }, []);

  const setRailCollapsed = useCallback((updater: boolean | ((c: boolean) => boolean)) => {
    setPrefs((current) => ({
      ...current,
      railCollapsed:
        typeof updater === "function" ? updater(current.railCollapsed) : updater,
    }));
  }, []);

  const hiddenSourceKeys = useMemo(
    () => new Set(sources.filter((s) => s.hidden).map((s) => s.sourceKey)),
    [sources],
  );

  const ctx = useMemo(
    () => ({
      dealId: search.get("dealId"),
      accountId: search.get("accountId"),
      installationId: search.get("installationId"),
    }),
    [search],
  );

  // Deep-link desde Mi día / Próximos días: ?date=YYYY-MM-DD.
  const appliedDateRef = useRef<string | null>(null);
  useEffect(() => {
    const date = search.get("date");
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date) && appliedDateRef.current !== date) {
      appliedDateRef.current = date;
      setAnchor(dateAtChileSlot(date, 0));
    }
  }, [search]);

  // ?tarea=<id> → abre modal canónico.
  const appliedTareaRef = useRef<string | null>(null);
  useEffect(() => {
    const tarea = search.get("tarea");
    if (!tarea || appliedTareaRef.current === tarea) return;
    appliedTareaRef.current = tarea;
    setTaskDetailId(tarea);
    setSelected(null);
    clearSearchParam("tarea");
  }, [search]);

  // ?item=<source>:<id> → selecciona e inspector + scroll.
  const appliedItemRef = useRef<string | null>(null);
  useEffect(() => {
    const raw = search.get("item");
    if (!raw || appliedItemRef.current === raw || initialLoading) return;
    const colon = raw.indexOf(":");
    if (colon <= 0) return;
    const source = raw.slice(0, colon);
    const id = raw.slice(colon + 1);
    const found = items.find((item) => item.source === source && item.id === id);
    if (!found) return;
    appliedItemRef.current = raw;
    setSelected(found);
    setTaskDetailId(null);
    clearSearchParam("item");
    requestAnimationFrame(() => {
      document
        .querySelector(`[data-agenda-event="${itemKey(found)}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }, [search, items, initialLoading]);

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
    clearSearchParam("cal");
  }, [search, load]);

  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const googleByUserId = useMemo(() => {
    if (!google || google.team.length === 0) return null;
    return new Map(google.team.map((member) => [member.userId, member.connected]));
  }, [google]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (hiddenSourceKeys.has(itemSourceKey(item))) return false;
      const isTask = item.source === "tarea";
      if (contentFilter === "tareas" && !isTask) return false;
      if (contentFilter === "reuniones" && isTask) return false;
      if (!isTask && typeFilter !== "todos" && item.type !== typeFilter) return false;
      if (assignedUserIds.length > 0) {
        const itemAssignees = item.assignedUserIds?.length
          ? item.assignedUserIds
          : [item.assignedUserId];
        if (!itemAssignees.some((id) => assignedUserIds.includes(id))) {
          return false;
        }
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
  }, [items, hiddenSourceKeys, contentFilter, typeFilter, assignedUserIds, query]);

  const handleSelect = useCallback((item: AgendaCalendarItem) => {
    if (item.source === "tarea") {
      setTaskDetailId(item.id);
      setSelected(null);
      return;
    }
    setSelected(item);
    setTaskDetailId(null);
  }, []);

  const visibleDays = useMemo(
    () => new Set(displayDays.map((day) => ymdInChile(day))),
    [displayDays],
  );

  const sourceCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of items) {
      const key = itemSourceKey(item);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [items]);

  const toggleSource = useCallback(
    (sourceKey: string) => {
      const source = sources.find((s) => s.sourceKey === sourceKey);
      if (!source) return;
      void patchSource(sourceKey, { hidden: !source.hidden });
    },
    [sources, patchSource],
  );

  const handleColorChange = useCallback(
    (sourceKey: string, color: string) => {
      void patchSource(sourceKey, { color });
    },
    [patchSource],
  );

  const handleSetCreateTarget = useCallback(
    (sourceKey: string) => {
      void patchSource(sourceKey, { isCreateTarget: true });
    },
    [patchSource],
  );

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
        if (taskDetailId) {
          setTaskDetailId(null);
          return qc;
        }
        setSelected(null);
        return qc;
      });
    }, [taskDetailId]),
  });

  const lastSelectedRef = useRef<AgendaCalendarItem | null>(null);
  if (selected) lastSelectedRef.current = selected;
  const inspectorItem = selected ?? lastSelectedRef.current;

  const selectedKey = selected ? itemKey(selected) : taskDetailId ? `tarea:${taskDetailId}` : null;
  const gridPrefs = useMemo(() => toGridPrefs(prefs), [prefs]);

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
        prefs={prefs}
        onPrefsChange={updatePrefs}
        refreshing={refreshing}
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
          sources={sources}
          counts={sourceCounts}
          multiEnabled={multiEnabled}
          onSelectDate={(ymd) => setAnchor(dateAtChileSlot(ymd, 0))}
          onToggleSource={toggleSource}
          onColorChange={handleColorChange}
          onSetCreateTarget={handleSetCreateTarget}
        />
        <div className="min-w-0 flex-1">
          {initialLoading ? (
            <div className="flex h-full items-center justify-center">
              <Spinner />
            </div>
          ) : (
            <AgendaCalendarGrid
              anchor={anchor}
              days={displayDays}
              items={filtered}
              view={view}
              selectedKey={selectedKey}
              usersById={usersById}
              gridPrefs={gridPrefs}
              colorBySource={colorBySource}
              onSelect={handleSelect}
              onMove={(item, schedule) => void persistSchedule(item, schedule)}
              onResize={(item, schedule) => void persistSchedule(item, schedule)}
              onOpenDay={(ymd) => {
                setAnchor(dateAtChileSlot(ymd, 0));
                setView("day");
              }}
              onAllDayExpandedChange={(allDayExpanded) =>
                updatePrefs({ ...prefs, allDayExpanded })
              }
              onSlotClick={(dateKey, minute, origin) =>
                setQuickCreate({ mode: "evento", origin, dateKey, minute })
              }
            />
          )}
        </div>

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
          onOpenTask={(id) => {
            setTaskDetailId(id);
            setQuickCreate(null);
          }}
        />
      )}

      {taskDetailId && (
        <AgendaTaskDetail
          taskId={taskDetailId}
          users={users}
          currentUserId={currentUserId}
          userRole={userRole}
          onClose={() => setTaskDetailId(null)}
          onChanged={() => void load()}
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
