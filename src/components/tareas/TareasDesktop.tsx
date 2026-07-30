"use client";

import { ListChecks } from "lucide-react";
import { Surface, EmptyState, Skeleton, Stat, StatGrid } from "@/components/opai-ds";
import { cn } from "@/lib/utils";
import type { AgendaTeamMember } from "@/components/agenda/agenda-calendar.types";
import type { TareaViewGroup } from "@/modules/tareas/tareas-group";
import { TareaCreateBar } from "./TareaCreateBar";
import { TareaRow } from "./TareaRow";
import { TareaDetailPanel } from "./TareaDetailPanel";
import type { DueValue } from "./TareaDatePopover";
import type { TareaItem, TareaCreateInput, TareaKpis, TareaUpdateInput, TareaVista } from "./types";

const VIEWS: Array<{ id: TareaVista; label: string }> = [
  { id: "fecha", label: "Fecha" },
  { id: "prioridad", label: "Prioridad" },
  { id: "responsable", label: "Responsable" },
  { id: "origen", label: "Origen" },
];

function scrollToBucket(key: string) {
  const el =
    document.querySelector(`[data-bucket="${key}"]`) ??
    (key === "semana"
      ? document.querySelector('[data-bucket="manana"]')
      : null);
  el?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Vista desktop: KPIs + switcher + lista + panel lg+. */
export function TareasDesktop({
  groups, kpis, view, setView, users, nameById, loading, canEdit, canDelete,
  detailTask, detailId, onCreate, onOpen, onCloseDetail, onToggle, onDelete, onPostpone, onPriority, onSave,
}: {
  groups: TareaViewGroup<TareaItem>[];
  kpis: TareaKpis;
  view: TareaVista;
  setView: (v: TareaVista) => void;
  users: AgendaTeamMember[];
  nameById: Map<string, string>;
  loading: boolean;
  canEdit: boolean;
  canDelete: (task: TareaItem) => boolean;
  detailTask: TareaItem | null;
  detailId: string | null;
  onCreate: (input: TareaCreateInput) => Promise<boolean>;
  onOpen: (t: TareaItem) => void;
  onCloseDetail: () => void;
  onToggle: (t: TareaItem) => void;
  onDelete: (id: string) => void;
  onPostpone: (t: TareaItem, next: DueValue) => void;
  onPriority: (t: TareaItem, next: TareaItem["priority"]) => void;
  onSave: (id: string, input: TareaUpdateInput) => Promise<boolean>;
}) {
  const goKpi = (bucket: string) => {
    if (view !== "fecha") setView("fecha");
    requestAnimationFrame(() => scrollToBucket(bucket));
  };

  const list = (
    <div className="min-w-0 space-y-4">
      <StatGrid cols={2} lgCols={3}>
        <Stat label="Vencidas" value={kpis.vencidas} variant="danger" animate onClick={() => goKpi("vencidas")} />
        <Stat label="Hoy" value={kpis.hoy} variant="brand" animate onClick={() => goKpi("hoy")} />
        <Stat label="Semana" value={kpis.semana} variant="default" animate onClick={() => goKpi("semana")} />
      </StatGrid>

      <div className="flex flex-wrap gap-1 rounded-xl border border-ds-border-default bg-ds-surface-1 p-0.5 opai-glass-soft-m">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setView(v.id)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-[13px]",
              view === v.id ? "bg-primary text-primary-foreground" : "text-ds-text-4 hover:text-ds-text-1",
            )}
          >
            {v.label}
          </button>
        ))}
      </div>

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
            <section key={group.key} data-bucket={group.key} className="space-y-1">
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
                    canDelete={canDelete(task)}
                    selected={detailId === task.id}
                    onOpen={onOpen}
                    onToggle={onToggle}
                    onDelete={onDelete}
                    onPostpone={onPostpone}
                    onPriority={onPriority}
                  />
                ))}
              </Surface>
            </section>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-4 lg:items-start">
      {list}
      <div className="sticky top-4 hidden max-h-[calc(100vh-6rem)] lg:block">
        <TareaDetailPanel
          task={detailTask}
          users={users}
          nameById={nameById}
          canEdit={canEdit}
          canDelete={detailTask ? canDelete(detailTask) : false}
          onClose={onCloseDetail}
          onSave={onSave}
          onDelete={onDelete}
          onToggle={onToggle}
          onPostpone={onPostpone}
        />
      </div>
    </div>
  );
}
