"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { showUndo } from "@/components/opai-ds";
import { useIsTouchLayout } from "@/lib/breakpoints";
import { canDeleteTarea } from "@/lib/productividad-task-ownership";
import { useTareas } from "./useTareas";
import { useTareasKeyboard } from "./useTareasKeyboard";
import { TareasDesktop } from "./TareasDesktop";
import { TareasMobile } from "./TareasMobile";
import { TareasFilterBar } from "./TareasFilterBar";
import { TareaDetailSheet } from "./TareaDetailSheet";
import type { DueValue } from "./TareaDatePopover";
import type { TareaItem } from "./types";

/** Página de Tareas (Productividad). Switch responsive desktop/móvil. */
export function TareasPageClient({
  canEdit, currentUserId, userRole,
}: {
  canEdit: boolean;
  currentUserId: string;
  userRole: string;
}) {
  const isMobile = useIsTouchLayout();
  const isBelowLg = isMobile;
  const search = useSearchParams();
  const {
    tasks, groups, groupsFecha, kpis, view, setView, users, nameById, loading,
    filters, setFilters, create, update, toggleDone, remove,
  } = useTareas();

  const [detailId, setDetailId] = useState<string | null>(null);
  const detailTask = tasks.find((t) => t.id === detailId) ?? null;
  const sheetOpen = Boolean(detailTask && isBelowLg);

  useEffect(() => {
    const task = search.get("task");
    if (task) setDetailId(task);
  }, [search]);

  const postpone = useCallback(
    (task: TareaItem, next: DueValue) => {
      const prev: DueValue = { dueAt: task.dueAt, allDay: task.allDay };
      void update(task.id, next);
      showUndo({ message: "Vencimiento actualizado", onUndo: () => void update(task.id, prev) });
    },
    [update],
  );

  const onPriority = useCallback(
    (task: TareaItem, next: TareaItem["priority"]) => { void update(task.id, { priority: next }); },
    [update],
  );

  const canDelete = useCallback(
    (task: TareaItem) => canDeleteTarea(task, currentUserId, userRole),
    [currentUserId, userRole],
  );

  const clearDetail = useCallback(() => {
    setDetailId(null);
    if (typeof window !== "undefined" && search.get("task")) {
      const url = new URL(window.location.href);
      url.searchParams.delete("task");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }, [search]);

  useTareasKeyboard({
    enabled: !isMobile,
    sheetOpen,
    canEdit,
    tasks,
    detailId,
    setDetailId,
    onToggle: toggleDone,
    onPostpone: postpone,
  });

  return (
    <div className="space-y-4 min-w-0">
      <TareasFilterBar filters={filters} setFilters={setFilters} users={users} />

      {isMobile ? (
        <TareasMobile
          groups={groupsFecha} users={users} nameById={nameById} loading={loading}
          canEdit={canEdit} canDelete={canDelete}
          onCreate={create} onOpen={(t) => setDetailId(t.id)}
          onToggle={toggleDone} onDelete={remove} onPostpone={postpone} onPriority={onPriority}
        />
      ) : (
        <TareasDesktop
          groups={groups} kpis={kpis} view={view} setView={setView}
          users={users} nameById={nameById} loading={loading}
          canEdit={canEdit} canDelete={canDelete}
          detailTask={detailTask} detailId={detailId}
          onCreate={create} onOpen={(t) => setDetailId(t.id)} onCloseDetail={clearDetail}
          onToggle={toggleDone} onDelete={remove} onPostpone={postpone}
          onPriority={onPriority} onSave={update}
        />
      )}

      {sheetOpen && (
        <TareaDetailSheet
          task={detailTask}
          users={users}
          nameById={nameById}
          canEdit={canEdit}
          canDelete={detailTask ? canDelete(detailTask) : false}
          onClose={clearDetail}
          onSave={update}
          onDelete={remove}
          onToggle={toggleDone}
          onPostpone={postpone}
        />
      )}
    </div>
  );
}
