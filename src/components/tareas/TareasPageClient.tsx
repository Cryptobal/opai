"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { showUndo } from "@/components/opai-ds";
import { SimpleSelect } from "@/components/ui/simple-select";
import { cn } from "@/lib/utils";
import { useIsMobileViewport } from "@/hooks/useIsMobileViewport";
import { useTareas } from "./useTareas";
import { TareasDesktop } from "./TareasDesktop";
import { TareasMobile } from "./TareasMobile";
import { TareaDetailSheet } from "./TareaDetailSheet";
import type { DueValue } from "./TareaDatePopover";
import { canDeleteTarea } from "@/lib/productividad-task-ownership";
import type { TareaItem, TareaStatusFilter } from "./types";

const STATUS_TABS: Array<{ id: TareaStatusFilter; label: string }> = [
  { id: "open", label: "Pendientes" },
  { id: "done", label: "Completadas" },
  { id: "all", label: "Todas" },
];

/** Página de Tareas (Productividad). Switch responsive desktop/móvil. */
export function TareasPageClient({
  canEdit,
  currentUserId,
  userRole,
}: {
  canEdit: boolean;
  currentUserId: string;
  userRole: string;
}) {
  const isMobile = useIsMobileViewport();
  const search = useSearchParams();
  const { tasks, groups, users, nameById, loading, filters, setFilters, create, update, toggleDone, remove } =
    useTareas();

  // El detalle se deriva de la lista viva (por id): así los cambios optimistas
  // (posposición, edición) se reflejan en el panel abierto sin snapshot obsoleto.
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailTask = tasks.find((t) => t.id === detailId) ?? null;

  // Deep-link desde Mi día: /opai/tareas?task=<id>
  useEffect(() => {
    const task = search.get("task");
    if (task) setDetailId(task);
  }, [search]);

  // Posposición rápida optimista con snackbar Deshacer (~10 s), reversible.
  const postpone = useCallback(
    (task: TareaItem, next: DueValue) => {
      const prev: DueValue = { dueAt: task.dueAt, allDay: task.allDay };
      void update(task.id, next);
      showUndo({
        message: "Vencimiento actualizado",
        onUndo: () => void update(task.id, prev),
      });
    },
    [update],
  );

  const canDelete = useCallback(
    (task: TareaItem) => canDeleteTarea(task, currentUserId, userRole),
    [currentUserId, userRole],
  );

  const viewProps = {
    groups,
    users,
    nameById,
    loading,
    canEdit,
    canDelete,
    onCreate: create,
    onOpen: (t: TareaItem) => setDetailId(t.id),
    onToggle: toggleDone,
    onDelete: remove,
    onPostpone: postpone,
  };

  const assigneeOptions = [
    { value: "", label: "Todos los responsables" },
    ...users.map((u) => ({ value: u.id, label: u.name })),
  ];

  return (
    // Sin PageHero (criterio del Hub, commit eca38a9): el contexto — módulo
    // "Productividad" y sección "Tareas" — lo entrega la barra superior, así
    // que no repetimos aquí un título/bajada. Se retiró por decisión del owner.
    <div className="space-y-4 min-w-0">
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

      {isMobile ? <TareasMobile {...viewProps} /> : <TareasDesktop {...viewProps} />}

      <TareaDetailSheet
        task={detailTask}
        users={users}
        canEdit={canEdit}
        canDelete={detailTask ? canDelete(detailTask) : false}
        onClose={() => {
          setDetailId(null);
          if (typeof window !== "undefined" && search.get("task")) {
            const url = new URL(window.location.href);
            url.searchParams.delete("task");
            window.history.replaceState({}, "", url.pathname + url.search);
          }
        }}
        onSave={update}
        onDelete={remove}
        onToggle={toggleDone}
        onPostpone={postpone}
      />
    </div>
  );
}
