"use client";

import type { RefObject } from "react";
import {
  ChevronLeft,
  ChevronRight,
  PanelLeft,
  Plus,
  Search,
} from "lucide-react";
import { SegmentedControl } from "@/components/opai-ds";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { isoWeekChile, CHILE_TZ } from "@/lib/dates-cl";
import { cn } from "@/lib/utils";
import type {
  AgendaContentFilter,
  AgendaTeamMember,
  AgendaTypeFilter,
  AgendaViewMode,
} from "../agenda-calendar.types";
import type { AgendaDesktopPrefs } from "./agenda-desktop-prefs";
import { AgendaFilterPopover } from "./AgendaFilterPopover";
import { AgendaPrefsPopover } from "./AgendaPrefsPopover";
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
  prefs: AgendaDesktopPrefs;
  onPrefsChange: (prefs: AgendaDesktopPrefs) => void;
  refreshing?: boolean;
};

/** Toolbar desktop de 1 línea — patrón ModuleToolbar: [views] [search/nav] ··· [secondary] [primary]. */
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
  prefs,
  onPrefsChange,
  refreshing = false,
}: Props) {
  return (
    <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-ds-border-subtle pb-2">
      <SegmentedControl
        items={VIEW_OPTIONS}
        value={view}
        onChange={onViewChange}
        size="sm"
        ariaLabel="Vista del calendario"
        className="shrink-0"
      />

      <div className="flex min-w-0 shrink items-baseline gap-2">
        <p className="min-w-0 truncate font-display text-[18px] font-semibold text-ds-text-1">
          {monthYearLabel(anchor)}
        </p>
        {view !== "month" && (
          <span className="shrink-0 whitespace-nowrap font-mono text-[12px] font-normal text-ds-text-4">
            · Semana {isoWeekChile(anchor)}
          </span>
        )}
      </div>

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

      <div className="flex-1" />

      <button
        type="button"
        onClick={onToggleRail}
        aria-label="Mostrar u ocultar panel lateral"
        className={cn(CONTROL, "w-9 border-0 bg-transparent px-0")}
      >
        <PanelLeft className="h-4 w-4" />
      </button>

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

      <AgendaPrefsPopover
        prefs={prefs}
        onChange={onPrefsChange}
        buttonClass={cn(CONTROL, "w-9 px-0")}
      />

      {refreshing && (
        <span className="font-mono text-[12px] text-ds-text-4" aria-live="polite">
          Actualizando…
        </span>
      )}

      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger
            onClick={onCreate}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground shadow-ds-xs ds-tap"
          >
            <Plus className="h-4 w-4" />
            Crear
            <kbd className="rounded border border-primary-foreground/25 px-1 font-mono text-[12px] font-normal">
              C
            </kbd>
          </TooltipTrigger>
          <TooltipContent
            align="end"
            className="space-y-0.5 font-mono text-[12px] leading-relaxed"
          >
            <p>C crear · / buscar · T hoy</p>
            <p>D / 3 / W / M vistas · ← → navegar · Esc cierra</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
