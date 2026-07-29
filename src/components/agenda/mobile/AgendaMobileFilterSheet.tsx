"use client";

import { paletteFgBg } from "@/lib/design/calendar-palette";
import { cn } from "@/lib/utils";
import type {
  AgendaContentFilter,
  AgendaTeamMember,
  AgendaTypeFilter,
} from "../agenda-calendar.types";
import type { CalendarSource } from "../desktop/AgendaCalendarList";
import { FilterGroup } from "../FilterGroup";

const CONTENT_OPTIONS = [
  { id: "todo", label: "Todo" },
  { id: "reuniones", label: "Reuniones y visitas" },
  { id: "tareas", label: "Tareas" },
];

const TYPE_OPTIONS = [
  { id: "todos", label: "Todos los tipos" },
  { id: "cliente", label: "Cliente" },
  { id: "tecnica", label: "Técnica" },
  { id: "supervision", label: "Supervisión" },
  { id: "otra", label: "Otra" },
  { id: "licitacion", label: "Licitación" },
];

type Props = {
  open: boolean;
  contentFilter: AgendaContentFilter;
  typeFilter: AgendaTypeFilter;
  assignedUserId: string;
  users: AgendaTeamMember[];
  sources: CalendarSource[];
  onContentFilterChange: (value: AgendaContentFilter) => void;
  onTypeFilterChange: (value: AgendaTypeFilter) => void;
  onAssignedUserChange: (id: string) => void;
  onToggleSource: (sourceKey: string) => void;
  onClose: () => void;
};

/** Sheet de filtros móvil: mismos grupos del popover desktop (reusa FilterGroup). */
export function AgendaMobileFilterSheet({
  open,
  contentFilter,
  typeFilter,
  assignedUserId,
  users,
  sources,
  onContentFilterChange,
  onTypeFilterChange,
  onAssignedUserChange,
  onToggleSource,
  onClose,
}: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/45 lg:hidden" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Filtros de agenda"
        className="opai-glass-strong max-h-[80vh] w-full overflow-y-auto rounded-b-none rounded-t-[28px] px-4 pt-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-[5px] w-10 rounded-full bg-ds-border-default" />
        <FilterGroup
          label="Contenido"
          options={CONTENT_OPTIONS}
          value={contentFilter}
          onChange={(value) => onContentFilterChange(value as AgendaContentFilter)}
        />
        <div className="my-3 border-t border-ds-border-subtle" />
        <FilterGroup
          label="Tipo"
          options={TYPE_OPTIONS}
          value={typeFilter}
          onChange={(value) => onTypeFilterChange(value as AgendaTypeFilter)}
        />
        <div className="my-3 border-t border-ds-border-subtle" />
        <FilterGroup
          label="Responsable"
          options={[{ id: "", label: "Todo el equipo" }, ...users.map((u) => ({ id: u.id, label: u.name }))]}
          value={assignedUserId}
          onChange={onAssignedUserChange}
        />
        <div className="my-3 border-t border-ds-border-subtle" />
        <p className="mb-2 text-[12px] font-medium uppercase tracking-wide text-ds-text-4">
          Calendarios
        </p>
        <div className="space-y-1">
          {sources.map((source) => {
            const active = !source.hidden;
            return (
              <button
                key={source.sourceKey}
                type="button"
                onClick={() => onToggleSource(source.sourceKey)}
                aria-pressed={active}
                className="flex h-10 w-full items-center gap-2 rounded-xl px-2 text-left text-[13px] ds-tap hover:bg-ds-surface-2"
              >
                <span
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 rounded",
                    active ? paletteFgBg(source.color) : "border border-ds-border-default",
                  )}
                />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate",
                    active ? "text-ds-text-2" : "text-ds-text-4 line-through",
                  )}
                >
                  {source.name}
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 h-11 w-full rounded-xl bg-primary text-[13px] font-semibold text-primary-foreground ds-tap"
        >
          Listo
        </button>
      </div>
    </div>
  );
}
