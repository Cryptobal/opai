"use client";

import { useMemo, useState } from "react";
import { Plus, X, ListChecks, AlertTriangle } from "lucide-react";
import { Surface, EmptyState, Skeleton } from "@/components/opai-ds";
import { cn } from "@/lib/utils";
import type { AgendaTeamMember } from "@/components/agenda/agenda-calendar.types";
import { todayInChile } from "@/lib/dates-cl";
import type { TareaViewGroup } from "@/modules/tareas/tareas-group";
import { TareaCreateBar } from "./TareaCreateBar";
import { TareaRowSwipe } from "./TareaRowSwipe";
import { dueFromYmd, DEFAULT_MINUTE, type DueValue } from "./TareaDatePopover";
import type { TareaItem, TareaCreateInput } from "./types";

type Segment = "hoy" | "proximas" | "todas";
const SEGS: Array<{ id: Segment; label: string }> = [
  { id: "hoy", label: "Hoy" },
  { id: "proximas", label: "Próximas" },
  { id: "todas", label: "Todas" },
];
const HOY_KEYS = new Set(["hoy", "vencidas"]);
const PROX_KEYS = new Set(["manana", "semana", "adelante", "sin_fecha"]);

/** Vista móvil: segmentos + banner vencidas + swipe + FAB. */
export function TareasMobile({
  groups, users, nameById, loading, canEdit, canDelete,
  onCreate, onOpen, onToggle, onDelete, onPostpone, onPriority,
}: {
  groups: TareaViewGroup<TareaItem>[];
  users: AgendaTeamMember[];
  nameById: Map<string, string>;
  loading: boolean;
  canEdit: boolean;
  canDelete: (task: TareaItem) => boolean;
  onCreate: (input: TareaCreateInput) => Promise<boolean>;
  onOpen: (t: TareaItem) => void;
  onToggle: (t: TareaItem) => void;
  onDelete: (id: string) => void;
  onPostpone: (t: TareaItem, next: DueValue) => void;
  onPriority: (t: TareaItem, next: TareaItem["priority"]) => void;
}) {
  const [seg, setSeg] = useState<Segment>("hoy");
  const [creating, setCreating] = useState(false);
  const overdue = useMemo(() => groups.find((g) => g.key === "vencidas")?.tasks ?? [], [groups]);
  const visible = useMemo(() => {
    if (seg === "todas") return groups;
    const keys = seg === "hoy" ? HOY_KEYS : PROX_KEYS;
    return groups.filter((g) => keys.has(g.key));
  }, [groups, seg]);

  return (
    <div className="space-y-3 pb-24">
      <div className="flex rounded-xl border border-ds-border-default bg-ds-surface-1 p-0.5 opai-glass-soft-m">
        {SEGS.map((s) => (
          <button key={s.id} type="button" onClick={() => setSeg(s.id)} className={cn("flex-1 rounded-lg px-3 py-1.5 text-[13px]", seg === s.id ? "bg-primary text-primary-foreground" : "text-ds-text-4")}>
            {s.label}
          </button>
        ))}
      </div>

      {overdue.length > 0 && canEdit && (
        <div className="flex items-center gap-2 rounded-xl border border-status-danger-border bg-status-danger-soft px-3 py-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-status-danger-fg" />
          <p className="min-w-0 flex-1 text-[13px] text-status-danger-fg">
            {overdue.length} vencida{overdue.length === 1 ? "" : "s"}
          </p>
          <button
            type="button"
            onClick={() => {
              const due = dueFromYmd(todayInChile(), DEFAULT_MINUTE, true);
              for (const t of overdue) onPostpone(t, due);
            }}
            className="shrink-0 rounded-lg bg-ds-surface-1 px-2.5 py-1.5 text-[12px] font-medium text-ds-text-1"
          >
            Reprogramar a hoy
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
      ) : visible.length === 0 ? (
        <EmptyState icon={ListChecks} title="Sin tareas" description="No hay tareas en este segmento." />
      ) : (
        visible.map((group) => (
          <section key={group.key} className="space-y-1">
            <div className="flex items-center gap-2 px-1">
              <span className="text-[13px] font-semibold text-ds-text-2">{group.label}</span>
              <span className="text-[12px] text-ds-text-4">{group.tasks.length}</span>
            </div>
            <Surface className="overflow-hidden px-0 py-0">
              {group.tasks.map((task) => (
                <TareaRowSwipe
                  key={task.id} task={task} nameById={nameById} canEdit={canEdit}
                  canDelete={canDelete(task)} onOpen={onOpen} onToggle={onToggle}
                  onDelete={onDelete} onPostpone={onPostpone} onPriority={onPriority}
                />
              ))}
            </Surface>
          </section>
        ))
      )}

      {canEdit && !creating && (
        <button type="button" onClick={() => setCreating(true)} aria-label="Nueva tarea" style={{ bottom: "calc(var(--bottom-nav-height, 88px) + 20px)" }} className="fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-ds-lg">
          <Plus className="h-6 w-6" />
        </button>
      )}

      {canEdit && creating && (
        <div className="opai-glass-strong fixed inset-x-0 bottom-0 z-50 max-h-[88vh] overflow-y-auto rounded-b-none p-3" style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-semibold text-ds-text-1">Nueva tarea</span>
            <button type="button" onClick={() => setCreating(false)} aria-label="Cerrar" className="flex h-9 w-9 items-center justify-center rounded-lg text-ds-text-4">
              <X className="h-5 w-5" />
            </button>
          </div>
          <TareaCreateBar users={users} onCreate={onCreate} onDone={() => setCreating(false)} />
        </div>
      )}
    </div>
  );
}
