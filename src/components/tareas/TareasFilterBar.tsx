"use client";

import { Search } from "lucide-react";
import { SimpleSelect } from "@/components/ui/simple-select";
import { cn } from "@/lib/utils";
import type { AgendaTeamMember } from "@/components/agenda/agenda-calendar.types";
import type { TareaFilters, TareaStatusFilter } from "./types";

const STATUS_TABS: Array<{ id: TareaStatusFilter; label: string }> = [
  { id: "open", label: "Pendientes" },
  { id: "done", label: "Completadas" },
  { id: "all", label: "Todas" },
];

/** Filtros superiores: estado / responsable / búsqueda. */
export function TareasFilterBar({
  filters,
  setFilters,
  users,
}: {
  filters: TareaFilters;
  setFilters: (fn: (f: TareaFilters) => TareaFilters) => void;
  users: AgendaTeamMember[];
}) {
  const assigneeOptions = [
    { value: "", label: "Todos los responsables" },
    ...users.map((u) => ({ value: u.id, label: u.name })),
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-xl border border-ds-border-default bg-ds-surface-1 p-0.5 opai-glass-soft-m">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilters((f) => ({ ...f, status: tab.id }))}
            className={cn(
              "rounded-lg px-3 py-1.5 text-[13px]",
              filters.status === tab.id
                ? "bg-primary text-primary-foreground"
                : "text-ds-text-4 hover:text-ds-text-1",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <SimpleSelect
        value={filters.assigneeId}
        onValueChange={(v) => setFilters((f) => ({ ...f, assigneeId: v }))}
        options={assigneeOptions}
        aria-label="Filtrar por responsable"
        className="h-9 min-h-[44px] w-full rounded-xl text-[13px] sm:min-h-0 sm:w-auto"
      />
      <div className="relative min-w-[160px] flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ds-text-4" />
        <input
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
          placeholder="Buscar…"
          aria-label="Buscar tareas"
          className="h-9 min-h-[44px] w-full rounded-xl border border-ds-border-default bg-ds-surface-1 pl-8 pr-3 text-[13px] text-ds-text-1 opai-glass-soft-m sm:min-h-0"
        />
      </div>
    </div>
  );
}
