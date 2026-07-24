"use client";

import { ListChecks } from "lucide-react";
import { Surface, EmptyState, Skeleton } from "@/components/opai-ds";
import type { AgendaTeamMember } from "@/components/agenda/agenda-calendar.types";
import { TareaCreateBar } from "./TareaCreateBar";
import { TareaRow } from "./TareaRow";
import type { DueValue } from "./TareaDatePopover";
import type { TareaItem, TareaCreateInput } from "./types";
import type { TareaGroup } from "@/modules/tareas/tareas.service";

/** Vista desktop: creación inline + lista agrupada por vencimiento. */
export function TareasDesktop({
  groups,
  users,
  nameById,
  loading,
  canEdit,
  onCreate,
  onOpen,
  onToggle,
  onDelete,
  onPostpone,
}: {
  groups: TareaGroup<TareaItem>[];
  users: AgendaTeamMember[];
  nameById: Map<string, string>;
  loading: boolean;
  canEdit: boolean;
  onCreate: (input: TareaCreateInput) => Promise<boolean>;
  onOpen: (t: TareaItem) => void;
  onToggle: (t: TareaItem) => void;
  onDelete: (id: string) => void;
  onPostpone: (t: TareaItem, next: DueValue) => void;
}) {
  return (
    <div className="space-y-4">
      {canEdit && <TareaCreateBar users={users} onCreate={onCreate} />}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-xl" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <EmptyState icon={ListChecks} title="Sin tareas" description="No hay tareas para los filtros actuales." />
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <section key={group.bucket} className="space-y-1">
              <div className="flex items-center gap-2 px-1">
                <h3 className="text-[13px] font-semibold text-ds-text-2">{group.label}</h3>
                <span className="text-[12px] text-ds-text-4">{group.tasks.length}</span>
              </div>
              <Surface className="px-3 py-1">
                {group.tasks.map((task) => (
                  <TareaRow
                    key={task.id}
                    task={task}
                    nameById={nameById}
                    canEdit={canEdit}
                    onOpen={onOpen}
                    onToggle={onToggle}
                    onDelete={onDelete}
                    onPostpone={onPostpone}
                  />
                ))}
              </Surface>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
