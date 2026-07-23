"use client";

import { FilterGroup } from "../FilterGroup";
import type {
  AgendaContentFilter,
  AgendaTeamMember,
  AgendaTypeFilter,
} from "../agenda-calendar.types";

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
  onContentFilterChange: (value: AgendaContentFilter) => void;
  onTypeFilterChange: (value: AgendaTypeFilter) => void;
  onAssignedUserChange: (id: string) => void;
  onClose: () => void;
};

/** Sheet de filtros móvil: mismos grupos del popover desktop (reusa FilterGroup). */
export function AgendaMobileFilterSheet({
  open,
  contentFilter,
  typeFilter,
  assignedUserId,
  users,
  onContentFilterChange,
  onTypeFilterChange,
  onAssignedUserChange,
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
