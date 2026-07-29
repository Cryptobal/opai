"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { todayInChile } from "@/lib/dates-cl";
import type {
  AgendaCalendarItem,
  AgendaContentFilter,
  AgendaTypeFilter,
} from "../agenda-calendar.types";
import { LicitacionDrawer } from "../LicitacionDrawer";
import { AgendaTaskDetail } from "../desktop/AgendaTaskDetail";
import { AgendaDayView } from "./AgendaDayView";
import { AgendaDetailSheet } from "./AgendaDetailSheet";
import { EventComposer } from "./EventComposer";
import { AgendaFab } from "./AgendaFab";
import { AgendaListView } from "./AgendaListView";
import { AgendaMonthView } from "./AgendaMonthView";
import { AgendaMobileFilterSheet } from "./AgendaMobileFilterSheet";
import { AgendaMobileHeader } from "./AgendaMobileHeader";
import { AgendaViewSheet } from "./AgendaViewSheet";
import {
  readMobilePrefs,
  writeMobilePrefs,
  type AgendaMobileView,
} from "./agenda-mobile-utils";
import {
  daysWithEventsSet,
  filterMobileItems,
  useAgendaMobileData,
} from "./useAgendaMobileData";

/**
 * Experiencia Agenda móvil (< lg): header glass compacto + vistas
 * Agenda/Día/Mes + FAB. Nada de PageHero/toolbar desktop (spec §1).
 */
export function AgendaMobile({
  currentUserId,
  userRole,
}: {
  currentUserId: string;
  userRole: string;
}) {
  const search = useSearchParams();
  const [view, setView] = useState<AgendaMobileView>("agenda");
  const [selectedYmd, setSelectedYmd] = useState(() => todayInChile());
  const [contentFilter, setContentFilter] = useState<AgendaContentFilter>("todo");
  const [typeFilter, setTypeFilter] = useState<AgendaTypeFilter>("todos");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [viewSheetOpen, setViewSheetOpen] = useState(false);
  const [visitaId, setVisitaId] = useState<string | null>(null);
  const [licId, setLicId] = useState<string | null>(null);
  const [taskDetailId, setTaskDetailId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerDate, setComposerDate] = useState<string | null>(null);

  // Prefs móviles con clave propia (B13 del audit).
  useEffect(() => {
    setView(readMobilePrefs().view);
  }, []);
  useEffect(() => {
    writeMobilePrefs({ view, date: selectedYmd });
  }, [view, selectedYmd]);

  // Deep links: ?visita= detalle; ?nueva=1 composer; ?date= día; ?tarea= modal.
  useEffect(() => {
    const visita = search.get("visita") ?? search.get("evento");
    if (visita) setVisitaId(visita);
    if (search.get("nueva") === "1") setComposerOpen(true);
    const date = search.get("date");
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setSelectedYmd(date);
    }
    const tarea = search.get("tarea");
    if (tarea) {
      setTaskDetailId(tarea);
      const url = new URL(window.location.href);
      url.searchParams.delete("tarea");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }, [search]);

  const { items, users, loading, error, reload } = useAgendaMobileData(view, selectedYmd);

  const filtered = useMemo(
    () => filterMobileItems(items, { contentFilter, typeFilter, assignedUserId }),
    [items, contentFilter, typeFilter, assignedUserId],
  );
  const daysWithEvents = useMemo(() => daysWithEventsSet(filtered), [filtered]);
  const filterCount =
    (contentFilter !== "todo" ? 1 : 0) +
    (typeFilter !== "todos" ? 1 : 0) +
    (assignedUserId ? 1 : 0);

  const handleSelect = (item: AgendaCalendarItem) => {
    if (item.source === "licitacion" || item.type === "licitacion") {
      setLicId(item.dealId ?? item.id);
      return;
    }
    if (item.source === "tarea") {
      setTaskDetailId(item.id);
      return;
    }
    if (item.source === "agenda_visita") setVisitaId(item.id);
  };

  return (
    <div className="relative min-w-0">
      <AgendaMobileHeader
        view={view}
        selectedYmd={selectedYmd}
        daysWithEvents={daysWithEvents}
        filterCount={filterCount}
        onOpenViewSheet={() => setViewSheetOpen(true)}
        onSelectDate={setSelectedYmd}
        onToday={() => {
          setSelectedYmd(todayInChile());
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        onOpenFilters={() => setFiltersOpen(true)}
      />

      {view === "agenda" && (
        <AgendaListView
          selectedYmd={selectedYmd}
          items={filtered}
          loading={loading}
          error={error}
          onRetry={() => void reload()}
          onSelect={handleSelect}
          onChanged={() => void reload()}
          onCreateAt={(ymd) => {
            setComposerDate(ymd);
            setComposerOpen(true);
          }}
        />
      )}
      {view === "day" && (
        <AgendaDayView
          selectedYmd={selectedYmd}
          items={filtered}
          onSelectDate={setSelectedYmd}
          onSelect={handleSelect}
        />
      )}
      {view === "month" && (
        <AgendaMonthView
          selectedYmd={selectedYmd}
          items={filtered}
          onSelectDate={setSelectedYmd}
          onSelect={handleSelect}
          onChanged={() => void reload()}
        />
      )}

      <AgendaFab
        onClick={() => {
          setComposerDate(selectedYmd);
          setComposerOpen(true);
        }}
      />

      <AgendaViewSheet
        open={viewSheetOpen}
        view={view}
        selectedYmd={selectedYmd}
        onViewChange={(v) => {
          setView(v);
          setViewSheetOpen(false);
        }}
        onSelectDate={setSelectedYmd}
        onClose={() => setViewSheetOpen(false)}
      />

      <AgendaMobileFilterSheet
        open={filtersOpen}
        contentFilter={contentFilter}
        typeFilter={typeFilter}
        assignedUserId={assignedUserId}
        users={users}
        onContentFilterChange={setContentFilter}
        onTypeFilterChange={setTypeFilter}
        onAssignedUserChange={setAssignedUserId}
        onClose={() => setFiltersOpen(false)}
      />

      <EventComposer
        open={composerOpen}
        users={users}
        prefillDate={composerDate}
        onClose={() => setComposerOpen(false)}
        onCreated={() => void reload()}
      />
      <AgendaDetailSheet
        visitaId={visitaId}
        onClose={() => setVisitaId(null)}
        onChanged={() => void reload()}
      />
      <LicitacionDrawer
        dealId={licId}
        onClose={() => setLicId(null)}
        onAgendar={() => {
          setLicId(null);
          setComposerOpen(true);
        }}
      />
      {taskDetailId && (
        <AgendaTaskDetail
          taskId={taskDetailId}
          users={users}
          currentUserId={currentUserId}
          userRole={userRole}
          onClose={() => setTaskDetailId(null)}
          onChanged={() => void reload()}
        />
      )}
    </div>
  );
}
