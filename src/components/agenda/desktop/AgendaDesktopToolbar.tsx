"use client";

import type { RefObject } from "react";
import {
  ChevronLeft,
  ChevronRight,
  PanelLeft,
  Plus,
  Search,
} from "lucide-react";
import { isoWeekChile, CHILE_TZ } from "@/lib/dates-cl";
import { cn } from "@/lib/utils";
import type {
  AgendaContentFilter,
  AgendaTeamMember,
  AgendaTypeFilter,
  AgendaViewMode,
} from "../agenda-calendar.types";
import { AgendaFilterPopover } from "./AgendaFilterPopover";
import { AgendaTeamPopover } from "./AgendaTeamPopover";

const VIEW_OPTIONS: Array<{ id: AgendaViewMode; label: string }> = [
  { id: "day", label: "Día" },
  { id: "multi", label: "3 días" },
  { id: "week", label: "Semana" },
  { id: "month", label: "Mes" },
];

const CONTROL =
  "inline-flex h-9 items-center justify-center rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] font-medium text-ds-text-2 transition-colors hover:bg-ds-surface-2 hover:text-ds-text-1 ds-tap";

function monthYearLabel(anchor: Date): string {
  const raw = anchor.toLocaleDateString("es-CL", {
    month: "long",
    year: "numeric",
    timeZone: CHILE_TZ,
  });
  const label = raw.replace(" de ", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

type Props = {
  anchor: Date;
  view: AgendaViewMode;
  query: string;
  users: AgendaTeamMember[];
  assignedUserIds: string[];
  googleByUserId: Map<string, boolean> | null;
  contentFilter: AgendaContentFilter;
  typeFilter: AgendaTypeFilter;
  searchRef: RefObject<HTMLInputElement | null>;
  onToggleRail: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  onViewChange: (view: AgendaViewMode) => void;
  onQueryChange: (query: string) => void;
  onAssignedUserIdsChange: (ids: string[]) => void;
  onContentFilterChange: (filter: AgendaContentFilter) => void;
  onTypeFilterChange: (filter: AgendaTypeFilter) => void;
  onCreate: () => void;
};

/** Toolbar desktop de 1 línea (52px) estilo Notion Calendar. */
export function AgendaDesktopToolbar({
  anchor,
  view,
  query,
  users,
  assignedUserIds,
  googleByUserId,
  contentFilter,
  typeFilter,
  searchRef,
  onToggleRail,
  onPrevious,
  onNext,
  onToday,
  onViewChange,
  onQueryChange,
  onAssignedUserIdsChange,
  onContentFilterChange,
  onTypeFilterChange,
  onCreate,
}: Props) {
  return (
    <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-ds-border-subtle pb-2">
      <button
        type="button"
        onClick={onToggleRail}
        aria-label="Mostrar u ocultar panel lateral"
        className={cn(CONTROL, "w-9 border-0 bg-transparent px-0")}
      >
        <PanelLeft className="h-4 w-4" />
      </button>

      <p className="min-w-0 shrink-0 truncate font-display text-[18px] font-semibold text-ds-text-1">
        {monthYearLabel(anchor)}
        {view !== "month" && (
          <span className="ml-2 font-mono text-[12px] font-normal text-ds-text-4">
            · Semana {isoWeekChile(anchor)}
          </span>
        )}
      </p>

      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={onPrevious}
          aria-label="Período anterior"
          className={cn(CONTROL, "w-8 border-0 bg-transparent px-0")}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onNext}
          aria-label="Período siguiente"
          className={cn(CONTROL, "w-8 border-0 bg-transparent px-0")}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <button type="button" onClick={onToday} className={CONTROL}>
        Hoy
      </button>

      <div className="flex shrink-0 items-center gap-0.5 rounded-xl bg-ds-surface-2 p-0.5">
        {VIEW_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onViewChange(option.id)}
            className={cn(
              "h-8 shrink-0 rounded-[10px] px-3 text-[13px] font-medium transition-colors ds-tap",
              view === option.id
                ? "bg-ds-surface-1 text-ds-text-1 shadow-ds-xs"
                : "text-ds-text-3 hover:text-ds-text-1",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="flex-1" />

      <label className="group flex h-9 w-44 items-center gap-2 rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-ds-text-3 transition-[width,border-color] focus-within:w-64 focus-within:border-primary/50">
        <Search className="h-4 w-4 shrink-0" />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Buscar"
          aria-label="Buscar en la agenda"
          className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px] text-ds-text-1 outline-none placeholder:text-ds-text-4 focus:ring-0"
        />
        <kbd className="rounded border border-ds-border-subtle bg-ds-surface-2 px-1 font-mono text-[12px] text-ds-text-4 group-focus-within:hidden">
          /
        </kbd>
      </label>

      <AgendaTeamPopover
        users={users}
        selectedIds={assignedUserIds}
        onChange={onAssignedUserIdsChange}
        googleByUserId={googleByUserId}
        buttonClass={CONTROL}
      />

      <AgendaFilterPopover
        contentFilter={contentFilter}
        typeFilter={typeFilter}
        onContentFilterChange={onContentFilterChange}
        onTypeFilterChange={onTypeFilterChange}
        buttonClass={CONTROL}
      />

      <button
        type="button"
        onClick={onCreate}
        title="Crear evento o tarea (C)"
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground shadow-ds-xs ds-tap"
      >
        <Plus className="h-4 w-4" />
        Crear
        <kbd className="rounded border border-primary-foreground/25 px-1 font-mono text-[12px] font-normal">
          C
        </kbd>
      </button>
    </div>
  );
}
