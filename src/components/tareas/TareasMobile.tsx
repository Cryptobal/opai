"use client";

import { useState } from "react";
import { Plus, ChevronDown, ChevronRight, X, ListChecks } from "lucide-react";
import { Surface, EmptyState, Skeleton } from "@/components/opai-ds";
import { cn } from "@/lib/utils";
import type { AgendaTeamMember } from "@/components/agenda/agenda-calendar.types";
import { TareaCreateBar } from "./TareaCreateBar";
import { TareaRow } from "./TareaRow";
import type { TareaItem, TareaCreateInput } from "./types";
import type { TareaBucket, TareaGroup } from "@/modules/tareas/tareas.service";

/** Vista móvil: secciones colapsables + FAB con sheet de creación. */
export function TareasMobile({
  groups,
  users,
  nameById,
  loading,
  canEdit,
  onCreate,
  onToggle,
  onDelete,
}: {
  groups: TareaGroup<TareaItem>[];
  users: AgendaTeamMember[];
  nameById: Map<string, string>;
  loading: boolean;
  canEdit: boolean;
  onCreate: (input: TareaCreateInput) => Promise<boolean>;
  onToggle: (t: TareaItem) => void;
  onDelete: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<TareaBucket>>(new Set());
  const [creating, setCreating] = useState(false);

  const toggleSection = (bucket: TareaBucket) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(bucket)) next.delete(bucket);
      else next.add(bucket);
      return next;
    });

  return (
    <div className="space-y-3 pb-24">
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-xl" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <EmptyState icon={ListChecks} title="Sin tareas" description="No hay tareas para los filtros actuales." />
      ) : (
        groups.map((group) => {
          const isCollapsed = collapsed.has(group.bucket);
          return (
            <section key={group.bucket} className="space-y-1">
              <button
                type="button"
                onClick={() => toggleSection(group.bucket)}
                className="flex min-h-[44px] w-full items-center gap-2 px-1 text-left"
              >
                {isCollapsed ? (
                  <ChevronRight className="h-4 w-4 text-ds-text-4" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-ds-text-4" />
                )}
                <span className="text-[13px] font-semibold text-ds-text-2">{group.label}</span>
                <span className="text-[12px] text-ds-text-4">{group.tasks.length}</span>
              </button>
              {!isCollapsed && (
                <Surface className="px-3 py-1">
                  {group.tasks.map((task) => (
                    <TareaRow
                      key={task.id}
                      task={task}
                      nameById={nameById}
                      canEdit={canEdit}
                      onToggle={onToggle}
                      onDelete={onDelete}
                    />
                  ))}
                </Surface>
              )}
            </section>
          );
        })
      )}

      {canEdit && !creating && (
        <button
          type="button"
          onClick={() => setCreating(true)}
          aria-label="Nueva tarea"
          className="fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-ds-lg"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      {canEdit && creating && (
        <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-ds-border-default bg-ds-surface-1 p-3 shadow-ds-lg">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-semibold text-ds-text-1">Nueva tarea</span>
            <button
              type="button"
              onClick={() => setCreating(false)}
              aria-label="Cerrar"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-ds-text-4 hover:bg-ds-surface-2"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <TareaCreateBar users={users} onCreate={onCreate} onDone={() => setCreating(false)} />
        </div>
      )}
    </div>
  );
}
