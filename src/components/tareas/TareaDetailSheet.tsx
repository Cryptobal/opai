"use client";

import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { CalendarPlus, Check, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { confirmDialog } from "@/components/ui/confirm-service";
import { cn } from "@/lib/utils";
import { useKeyboardOffset } from "@/hooks/useKeyboardOffset";
import { ymdInChile, addDaysChile } from "@/lib/dates-cl";
import type { AgendaTeamMember } from "@/components/agenda/agenda-calendar.types";
import { TareaDetailFields } from "./TareaDetailFields";
import { TareaPriorityChips } from "./TareaPriorityChips";
import { TareaOriginCard } from "./TareaOriginCard";
import { TareaActivityTimeline } from "./TareaActivityTimeline";
import { useTareaDetailDraft } from "./useTareaDetailDraft";
import { dueFromYmd, DEFAULT_MINUTE, type DueValue } from "./TareaDatePopover";
import type { TareaItem, TareaUpdateInput } from "./types";

const BTN = "flex min-h-[44px] items-center gap-1.5 rounded-xl px-3 text-[13px]";

/** Sheet móvil del detalle. */
export function TareaDetailSheet({
  task, users, nameById, canEdit, canDelete, onClose, onSave, onDelete, onToggle, onPostpone,
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
  onPostpone?: (t: TareaItem, next: DueValue) => void;
}) {
  const kb = useKeyboardOffset();
  const contentRef = useRef<HTMLDivElement>(null);
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);
  const [saving, setSaving] = useState(false);
  const draft = useTareaDetailDraft(task);

  useEffect(() => { setPortalEl(contentRef.current); }, [task?.id]);

  if (!task) return null;
  const done = task.status === "done";

  const requestClose = async () => {
    if (canEdit && draft.dirty && !(await confirmDialog({
      title: "Descartar cambios",
      description: "Tienes cambios sin guardar en esta tarea. ¿Quieres descartarlos?",
      confirmLabel: "Descartar", cancelLabel: "Seguir editando", variant: "destructive",
    }))) return;
    onClose();
  };

  const save = async () => {
    if (!draft.title.trim()) { toast.error("El título no puede quedar vacío"); return; }
    const input = draft.buildPatch();
    if (!input || Object.keys(input).length === 0) { onClose(); return; }
    setSaving(true);
    const ok = await onSave(task.id, input);
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Dialog.Root open onOpenChange={(o) => { if (!o) void requestClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/55 motion-safe:animate-in motion-safe:fade-in" />
        <Dialog.Content
          ref={contentRef}
          aria-label={`Detalle de tarea: ${task.title}`}
          style={kb > 0 ? { bottom: kb, maxHeight: `calc(92vh - ${kb}px)` } : undefined}
          className="opai-ios-surface-dialog fixed inset-x-0 bottom-0 z-[70] flex max-h-[92vh] flex-col rounded-t-3xl rounded-b-none border border-ds-border-default bg-card outline-none motion-safe:animate-in motion-safe:slide-in-from-bottom"
        >
          <div className="mx-auto mt-2 h-1 w-[38px] shrink-0 rounded-full bg-ds-text-4/40" />
          <div className="flex shrink-0 items-center gap-3 px-4 pt-3 pb-2">
            <button type="button" onClick={() => canEdit && onToggle(task)} disabled={!canEdit} aria-label={done ? "Marcar como pendiente" : "Completar tarea"} className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border", done ? "border-primary bg-primary text-primary-foreground" : "border-ds-border-default text-transparent")}>
              <Check className="h-3.5 w-3.5" />
            </button>
            <Dialog.Title className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ds-text-2">
              {done ? "Tarea completada" : "Detalle de tarea"}
            </Dialog.Title>
            <button type="button" onClick={() => void requestClose()} aria-label="Cerrar" className="flex h-9 w-9 items-center justify-center rounded-full text-ds-text-4">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-2">
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
              portalContainer={portalEl}
            />
            <TareaOriginCard task={task} />
            <TareaActivityTimeline task={task} nameById={nameById} canEdit={canEdit} compact />
          </div>

          {(canEdit || canDelete) && (
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-ds-border-subtle px-4 pt-3" style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}>
              {canEdit && onPostpone && (
                <>
                  <button type="button" onClick={() => onPostpone(task, dueFromYmd(ymdInChile(addDaysChile(new Date(), 1)), DEFAULT_MINUTE, true))} className={cn(BTN, "text-ds-text-2 hover:bg-ds-surface-2")}>
                    <CalendarPlus className="h-4 w-4" /> Posponer
                  </button>
                  <button type="button" onClick={() => onToggle(task)} className={cn(BTN, "text-ds-text-2 hover:bg-ds-surface-2")}>
                    <Check className="h-4 w-4" /> Completar
                  </button>
                </>
              )}
              {canDelete ? (
                <button type="button" onClick={() => onDelete(task.id)} className={cn(BTN, "text-status-danger-fg hover:bg-status-danger-soft")}>
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : <span />}
              {canEdit && (
                <button type="button" onClick={() => void save()} disabled={saving || !draft.dirty} className={cn(BTN, "ml-auto bg-primary font-medium text-primary-foreground disabled:opacity-50")}>
                  Guardar
                </button>
              )}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
