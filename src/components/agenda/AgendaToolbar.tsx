"use client";

import { useRef } from "react";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  SlidersHorizontal,
  UsersRound,
} from "lucide-react";
import { Avatar, Surface } from "@/components/opai-ds";
import { cn } from "@/lib/utils";
import type {
  AgendaContentFilter,
  AgendaTeamMember,
  AgendaTypeFilter,
  AgendaViewMode,
} from "./agenda-calendar.types";

const VIEW_OPTIONS: Array<{ id: AgendaViewMode; label: string }> = [
  { id: "day", label: "Día" },
  { id: "week", label: "Semana" },
  { id: "month", label: "Mes" },
];

const CONTENT_OPTIONS: Array<{ id: AgendaContentFilter; label: string }> = [
  { id: "todo", label: "Todo" },
  { id: "reuniones", label: "Reuniones y visitas" },
  { id: "tareas", label: "Tareas" },
];

const TYPE_OPTIONS: Array<{ id: AgendaTypeFilter; label: string }> = [
  { id: "todos", label: "Todos los tipos" },
  { id: "cliente", label: "Cliente" },
  { id: "tecnica", label: "Técnica" },
  { id: "supervision", label: "Supervisión" },
  { id: "otra", label: "Otra" },
  { id: "licitacion", label: "Licitación" },
];

const CONTROL =
  "inline-flex h-11 items-center justify-center rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] font-medium text-ds-text-2 transition-colors hover:bg-ds-surface-2 hover:text-ds-text-1 ds-tap sm:h-9";

type Props = {
  periodLabel: string;
  view: AgendaViewMode;
  multiDays: number;
  query: string;
  contentFilter: AgendaContentFilter;
  typeFilter: AgendaTypeFilter;
  assignedUserId: string;
  users: AgendaTeamMember[];
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  onViewChange: (view: AgendaViewMode) => void;
  onMultiDaysChange: (days: number) => void;
  onQueryChange: (query: string) => void;
  onContentFilterChange: (filter: AgendaContentFilter) => void;
  onTypeFilterChange: (filter: AgendaTypeFilter) => void;
  onAssignedUserChange: (userId: string) => void;
  onCreate: () => void;
};

function closeDetails(ref: React.RefObject<HTMLDetailsElement | null>) {
  if (ref.current) ref.current.open = false;
}

export function AgendaToolbar({
  periodLabel,
  view,
  multiDays,
  query,
  contentFilter,
  typeFilter,
  assignedUserId,
  users,
  onPrevious,
  onNext,
  onToday,
  onViewChange,
  onMultiDaysChange,
  onQueryChange,
  onContentFilterChange,
  onTypeFilterChange,
  onAssignedUserChange,
  onCreate,
}: Props) {
  const dayCountMenu = useRef<HTMLDetailsElement>(null);
  const peopleMenu = useRef<HTMLDetailsElement>(null);
  const filterMenu = useRef<HTMLDetailsElement>(null);
  const selectedUser = users.find((user) => user.id === assignedUserId);
  const activeFilterCount =
    Number(contentFilter !== "todo") + Number(typeFilter !== "todos");

  return (
    <Surface
      elevation={1}
      padding="sm"
      className="flex min-w-0 flex-col gap-2.5 shadow-none xl:flex-row xl:items-center"
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onPrevious}
          aria-label="Período anterior"
          className={cn(CONTROL, "w-11 px-0 sm:w-9")}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button type="button" onClick={onToday} className={CONTROL}>
          Hoy
        </button>
        <button
          type="button"
          onClick={onNext}
          aria-label="Período siguiente"
          className={cn(CONTROL, "w-11 px-0 sm:w-9")}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <p className="min-w-0 truncate px-1 text-[13px] font-medium capitalize text-ds-text-2">
          {periodLabel}
        </p>
      </div>

      <div className="flex items-center gap-0.5 overflow-x-auto rounded-xl bg-ds-surface-2 p-0.5 scrollbar-none">
        <button
          type="button"
          onClick={() => onViewChange("day")}
          className={viewButton(view === "day")}
        >
          Día
        </button>

        <details ref={dayCountMenu} className="group relative shrink-0">
          <summary className={cn(viewButton(view === "multi"), "gap-1 list-none")}>
            {multiDays} días
            <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
          </summary>
          <Surface
            elevation={4}
            padding="sm"
            className="absolute left-0 top-[calc(100%+6px)] z-[70] w-44 space-y-1"
          >
            <p className="px-2 pb-1 text-[12px] font-medium text-ds-text-4">
              Días visibles
            </p>
            {[2, 3, 4, 5, 6].map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => {
                  onMultiDaysChange(days);
                  onViewChange("multi");
                  closeDetails(dayCountMenu);
                }}
                className="flex h-11 w-full items-center justify-between rounded-lg px-2.5 text-left text-[13px] text-ds-text-2 hover:bg-ds-surface-3 ds-tap sm:h-9"
              >
                {days} días
                {view === "multi" && multiDays === days && (
                  <Check className="h-4 w-4 text-primary" />
                )}
              </button>
            ))}
          </Surface>
        </details>

        {VIEW_OPTIONS.filter((option) => option.id !== "day").map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onViewChange(option.id)}
            className={viewButton(view === option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-1.5 xl:ml-auto xl:flex-nowrap">
        <label className="group flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-ds-text-3 transition-[width,border-color] focus-within:border-primary/50 sm:h-9 sm:w-40 sm:flex-none sm:focus-within:w-56">
          <Search className="h-4 w-4 shrink-0" />
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Buscar"
            aria-label="Buscar en la agenda"
            className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px] text-ds-text-1 outline-none placeholder:text-ds-text-4 focus:ring-0"
          />
        </label>

        <details ref={peopleMenu} className="group relative">
          <summary
            className={cn(
              CONTROL,
              "cursor-pointer gap-2 list-none",
              assignedUserId && "border-primary/40 text-ds-text-1",
            )}
          >
            {selectedUser ? (
              <Avatar name={selectedUser.name} size="sm" variant="brand" />
            ) : (
              <span className="flex -space-x-2">
                {users.slice(0, 3).map((user, index) => (
                  <Avatar
                    key={user.id}
                    name={user.name}
                    size="sm"
                    variant={index === 0 ? "brand" : "default"}
                    className="ring-2 ring-ds-surface-1"
                  />
                ))}
                {users.length === 0 && <UsersRound className="h-4 w-4" />}
              </span>
            )}
            <span className="hidden max-w-28 truncate sm:inline">
              {selectedUser?.name ?? "Equipo"}
            </span>
            <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
          </summary>
          <Surface
            elevation={4}
            padding="sm"
            className="absolute right-0 top-[calc(100%+6px)] z-[70] max-h-80 w-64 space-y-1 overflow-y-auto"
          >
            <button
              type="button"
              onClick={() => {
                onAssignedUserChange("");
                closeDetails(peopleMenu);
              }}
              className="flex h-11 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px] text-ds-text-2 hover:bg-ds-surface-3 ds-tap sm:h-9"
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-ds-surface-3">
                <UsersRound className="h-4 w-4" />
              </span>
              <span className="flex-1">Todo el equipo</span>
              {!assignedUserId && <Check className="h-4 w-4 text-primary" />}
            </button>
            {users.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => {
                  onAssignedUserChange(user.id);
                  closeDetails(peopleMenu);
                }}
                className="flex h-11 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px] text-ds-text-2 hover:bg-ds-surface-3 ds-tap sm:h-9"
              >
                <Avatar name={user.name} size="sm" />
                <span className="min-w-0 flex-1 truncate">{user.name}</span>
                {assignedUserId === user.id && <Check className="h-4 w-4 text-primary" />}
              </button>
            ))}
          </Surface>
        </details>

        <details ref={filterMenu} className="group relative">
          <summary
            aria-label="Filtros"
            className={cn(
              CONTROL,
              "relative w-11 cursor-pointer list-none px-0 sm:w-9",
              activeFilterCount > 0 && "border-primary/40 text-primary",
            )}
          >
            <SlidersHorizontal className="h-4 w-4" />
            {activeFilterCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[12px] font-semibold text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </summary>
          <Surface
            elevation={4}
            padding="sm"
            className="absolute right-0 top-[calc(100%+6px)] z-[70] w-64 space-y-3"
          >
            <FilterGroup
              label="Contenido"
              options={CONTENT_OPTIONS}
              value={contentFilter}
              onChange={(value) => onContentFilterChange(value as AgendaContentFilter)}
            />
            <div className="border-t border-ds-border-subtle" />
            <FilterGroup
              label="Tipo"
              options={TYPE_OPTIONS}
              value={typeFilter}
              onChange={(value) => onTypeFilterChange(value as AgendaTypeFilter)}
            />
          </Surface>
        </details>

        <button
          type="button"
          onClick={onCreate}
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground shadow-ds-xs ds-tap sm:h-9"
        >
          <Plus className="h-4 w-4" />
          Crear
        </button>
      </div>
    </Surface>
  );
}

export function FilterGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ id: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <p className="px-2 text-[12px] font-medium text-ds-text-4">{label}</p>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className="flex h-11 w-full items-center justify-between rounded-lg px-2.5 text-left text-[13px] text-ds-text-2 hover:bg-ds-surface-3 ds-tap sm:h-9"
        >
          {option.label}
          {value === option.id && <Check className="h-4 w-4 text-primary" />}
        </button>
      ))}
    </div>
  );
}

function viewButton(active: boolean): string {
  return cn(
    "h-11 shrink-0 rounded-[10px] px-3 text-[13px] font-medium transition-colors ds-tap sm:h-8",
    active
      ? "bg-ds-surface-1 text-ds-text-1 shadow-ds-xs"
      : "text-ds-text-3 hover:text-ds-text-1",
  );
}
