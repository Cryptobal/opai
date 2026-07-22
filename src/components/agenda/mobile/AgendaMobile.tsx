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
import { NuevaVisitaModal } from "../NuevaVisitaModal";
import { VisitDrawer } from "../VisitDrawer";
import { AgendaDayView } from "./AgendaDayView";
import { AgendaFab } from "./AgendaFab";
import { AgendaListView } from "./AgendaListView";
import { AgendaMonthView } from "./AgendaMonthView";
import { AgendaMobileFilterSheet } from "./AgendaMobileFilterSheet";
import { AgendaMobileHeader } from "./AgendaMobileHeader";
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
export function AgendaMobile() {
  const search = useSearchParams();
  const [view, setView] = useState<AgendaMobileView>("agenda");
  const [selectedYmd, setSelectedYmd] = useState(() => todayInChile());
  const [contentFilter, setContentFilter] = useState<AgendaContentFilter>("todo");
  const [typeFilter, setTypeFilter] = useState<AgendaTypeFilter>("todos");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visitaId, setVisitaId] = useState<string | null>(null);
  const [licId, setLicId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);

  // Prefs móviles con clave propia (B13 del audit).
  useEffect(() => {
    setView(readMobilePrefs().view);
  }, []);
  useEffect(() => {
    writeMobilePrefs({ view, date: selectedYmd });
  }, [view, selectedYmd]);

  // Deep links: ?visita= abre el detalle; ?nueva=1 el composer.
  useEffect(() => {
    const visita = search.get("visita") ?? search.get("evento");
    if (visita) setVisitaId(visita);
    if (search.get("nueva") === "1") setComposerOpen(true);
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
    if (item.source === "tarea" && item.href) {
      window.location.href = item.href;
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
        onViewChange={setView}
        onSelectDate={setSelectedYmd}
        onToday={() => setSelectedYmd(todayInChile())}
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
          onCreateAt={() => setComposerOpen(true)}
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

      <AgendaFab onClick={() => setComposerOpen(true)} />

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

      <NuevaVisitaModal
        open={composerOpen}
        onOpenChange={setComposerOpen}
        onCreated={() => void reload()}
      />
      <VisitDrawer
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
    </div>
  );
}
