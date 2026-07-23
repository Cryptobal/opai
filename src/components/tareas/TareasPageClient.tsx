"use client";

import { Search } from "lucide-react";
import { PageHero } from "@/components/opai-ds";
import { cn } from "@/lib/utils";
import { useIsMobileViewport } from "@/hooks/useIsMobileViewport";
import { useTareas } from "./useTareas";
import { TareasDesktop } from "./TareasDesktop";
import { TareasMobile } from "./TareasMobile";
import type { TareaStatusFilter } from "./types";

const STATUS_TABS: Array<{ id: TareaStatusFilter; label: string }> = [
  { id: "open", label: "Pendientes" },
  { id: "done", label: "Completadas" },
  { id: "all", label: "Todas" },
];

/** Página de Tareas (Productividad). Switch responsive desktop/móvil. */
export function TareasPageClient({ canEdit }: { canEdit: boolean }) {
  const isMobile = useIsMobileViewport();
  const { groups, users, nameById, loading, filters, setFilters, create, toggleDone, remove } = useTareas();

  const viewProps = {
    groups,
    users,
    nameById,
    loading,
    canEdit,
    onCreate: create,
    onToggle: toggleDone,
    onDelete: remove,
  };

  return (
    <div className="space-y-4 min-w-0">
      <PageHero title="Tareas" subtitle="Tus pendientes y los del equipo, agrupados por vencimiento." />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-ds-border-default bg-ds-surface-1 p-0.5">
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

        <select
          value={filters.assigneeId}
          onChange={(e) => setFilters((f) => ({ ...f, assigneeId: e.target.value }))}
          aria-label="Filtrar por responsable"
          className="h-9 rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] text-ds-text-1"
        >
          <option value="">Todos los responsables</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>

        <div className="relative min-w-[160px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ds-text-4" />
          <input
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            placeholder="Buscar…"
            aria-label="Buscar tareas"
            className="h-9 w-full rounded-xl border border-ds-border-default bg-ds-surface-1 pl-8 pr-3 text-[13px] text-ds-text-1"
          />
        </div>
      </div>

      {isMobile ? <TareasMobile {...viewProps} /> : <TareasDesktop {...viewProps} />}
    </div>
  );
}
