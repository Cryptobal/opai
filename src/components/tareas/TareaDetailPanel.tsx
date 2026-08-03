"use client";

import { useRef, useState } from "react";
import { Check, CalendarPlus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { AgendaTeamMember } from "@/components/agenda/agenda-calendar.types";
import { todayInChile, ymdInChile, addDaysChile } from "@/lib/dates-cl";
import { TareaDetailFields } from "./TareaDetailFields";
import { TareaPriorityChips } from "./TareaPriorityChips";
import { TareaOriginCard } from "./TareaOriginCard";
import { TareaCrmLinkFields } from "./TareaCrmLinkFields";
import { TareaActivityTimeline } from "./TareaActivityTimeline";
import { useTareaDetailDraft } from "./useTareaDetailDraft";
import { dueFromYmd, DEFAULT_MINUTE, type DueValue } from "./TareaDatePopover";
import type { TareaItem, TareaUpdateInput } from "./types";

/** Panel de detalle persistente (desktop lg+). */
export function TareaDetailPanel({
  task, users, nameById, canEdit, canDelete,
  onClose, onSave, onDelete, onToggle, onPostpone,
}: {
  task: TareaItem | null;
  users: AgendaTeamMember[];
  nameById: Map<string, string>;
  canEdit: boolean;
  canDelete: boolean;
  onClose: () => void;
  onSave: (id: string, input: TareaUpdateInput) => Promise<boolean>;
  onDelete: (id: string) => void;
  onToggle: (t: TareaItem) => void;
  onPostpone: (t: TareaItem, next: DueValue) => void;
}) {
  const [saving, setSaving] = useState(false);
  const portalRef = useRef<HTMLDivElement>(null);
  const draft = useTareaDetailDraft(task);

  if (!task) {
    return (
      <aside className="hidden h-full flex-col rounded-2xl border border-ds-border-default bg-ds-surface-1 p-6 text-[13px] text-ds-text-4 lg:flex">
        Selecciona una tarea para ver el detalle.
      </aside>
    );
  }

  const done = task.status === "done";

  const save = async () => {
    if (!draft.title.trim()) { toast.error("El título no puede quedar vacío"); return; }
    const input = draft.buildPatch();
    if (!input || Object.keys(input).length === 0) return;
    setSaving(true);
    await onSave(task.id, input);
    setSaving(false);
  };

  return (
    <aside ref={portalRef} className="hidden h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-ds-border-default bg-ds-surface-1 lg:flex">
      <div className="flex shrink-0 items-center gap-2 border-b border-ds-border-subtle px-4 py-3">
        <button
          type="button" disabled={!canEdit} onClick={() => canEdit && onToggle(task)}
          aria-label={done ? "Marcar como pendiente" : "Completar tarea"}
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
            done ? "border-primary bg-primary text-primary-foreground" : "border-ds-border-default text-transparent hover:border-primary",
          )}
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ds-text-2">
          {done ? "Tarea completada" : "Detalle"}
        </h2>
        <button type="button" onClick={onClose} aria-label="Cerrar" className="flex h-9 w-9 items-center justify-center rounded-lg text-ds-text-4 hover:bg-ds-surface-2">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {canEdit && (
          <div className="space-y-1.5">
            <span className="px-1 text-[12px] font-medium text-ds-text-4">Prioridad</span>
            <TareaPriorityChips value={draft.priority} onChange={draft.setPriority} />
          </div>
        )}
        <TareaDetailFields
          task={task} canEdit={canEdit} title={draft.title} notes={draft.notes} due={draft.due}
          assigneeIds={draft.assigneeIds} users={users}
          onTitle={draft.setTitle} onNotes={draft.setNotes} onDue={draft.setDue} onAssignees={draft.setAssigneeIds}
          portalContainer={portalRef.current}
        />
        <TareaOriginCard task={task} />
        <TareaCrmLinkFields
          value={draft.crmLinks}
          canEdit={canEdit}
          fromEmail={Boolean(task.emailThreadId)}
          onChange={draft.setCrmLinks}
        />
        <TareaActivityTimeline task={task} nameById={nameById} canEdit={canEdit} />
      </div>

      {(canEdit || canDelete) && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-ds-border-subtle px-4 py-3">
          {canEdit && (
            <>
              <button type="button" onClick={() => onPostpone(task, dueFromYmd(ymdInChile(addDaysChile(new Date(), 1)), DEFAULT_MINUTE, true))} className="flex min-h-[40px] items-center gap-1.5 rounded-xl px-3 text-[13px] text-ds-text-2 hover:bg-ds-surface-2">
                <CalendarPlus className="h-4 w-4" /> Mañana
              </button>
              <button type="button" onClick={() => onPostpone(task, dueFromYmd(todayInChile(), DEFAULT_MINUTE, true))} className="flex min-h-[40px] items-center gap-1.5 rounded-xl px-3 text-[13px] text-ds-text-2 hover:bg-ds-surface-2">
                Hoy
              </button>
            </>
          )}
          <div className="ml-auto flex gap-2">
            {canDelete && (
              <button type="button" onClick={() => onDelete(task.id)} className="flex min-h-[40px] items-center gap-1.5 rounded-xl px-3 text-[13px] text-status-danger-fg hover:bg-status-danger-soft">
                <Trash2 className="h-4 w-4" /> Eliminar
              </button>
            )}
            {canEdit && (
              <button type="button" disabled={saving || !draft.dirty} onClick={() => void save()} className="flex min-h-[40px] items-center rounded-xl bg-primary px-4 text-[13px] font-medium text-primary-foreground disabled:opacity-50">
                Guardar
              </button>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
